"""Persistent POS checkout and Midtrans Snap Sandbox payment endpoints."""

import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from bson import Decimal128, ObjectId
from flask import Blueprint, current_app, jsonify, request
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.database.mongo import get_client
from app.integrations import midtrans
from app.middleware.auth import authenticate_request


sales_bp = Blueprint("sales", __name__, url_prefix="/api")
_sales_indexes_ready = False


class CheckoutError(Exception):
    def __init__(self, code, status=400, message=None):
        super().__init__(message or code)
        self.code = code
        self.status = status


def _database():
    client = get_client(
        current_app.config["MONGO_URI"],
        current_app.config["MONGO_SERVER_SELECTION_TIMEOUT_MS"],
    )
    return client, client[current_app.config["MONGO_DB_NAME"]]


def _ensure_sales_indexes(sales):
    global _sales_indexes_ready
    if _sales_indexes_ready:
        return
    sales.create_index(
        "receipt_number",
        unique=True,
        partialFilterExpression={"receipt_number": {"$type": "string"}},
        name="uq_sales_receipt_number",
    )
    sales.create_index(
        "client_request_id",
        unique=True,
        partialFilterExpression={"client_request_id": {"$type": "string"}},
        name="uq_sales_client_request_id",
    )
    sales.create_index(
        "payment_order_id",
        unique=True,
        partialFilterExpression={"payment_order_id": {"$type": "string"}},
        name="uq_sales_payment_order_id",
    )
    sales.create_index(
        "payment_reference",
        unique=True,
        partialFilterExpression={"payment_reference": {"$type": "string"}},
        name="uq_sales_payment_reference",
    )
    sales.create_index([("shift_id", 1), ("status", 1)], name="idx_sales_shift_status")
    sales.create_index(
        [("payment_status", 1), ("payment_expired_at", 1)],
        partialFilterExpression={"status": "pending"},
        name="idx_sales_pending_expiry",
    )
    sales.create_index(
        [("cashier_id", 1), ("created_at", -1)], name="idx_sales_cashier_created"
    )
    _sales_indexes_ready = True


def _authorized_user():
    if not current_app.config.get("JWT_SECRET_KEY"):
        return None, (jsonify(error="auth_not_configured"), 503)
    try:
        user, _ = authenticate_request()
    except (PyMongoError, ValueError):
        current_app.logger.exception("Sale request could not authenticate user")
        return None, (jsonify(error="database_unavailable"), 503)
    if not user:
        return None, (jsonify(error="authentication_required"), 401)
    return user, None


def _decimal(value):
    if isinstance(value, Decimal128):
        return value.to_decimal()
    return Decimal(str(value))


def _number(value):
    number = _decimal(value)
    return int(number) if number == number.to_integral_value() else float(number)


def _public_sale(document):
    return {
        "id": document["receipt_number"],
        "sale_id": str(document["_id"]),
        "receipt_number": document["receipt_number"],
        "cashier_id": str(document["cashier_id"]),
        "cashier": document["cashier_name"],
        "shift_id": str(document["shift_id"]),
        "items": [
            {
                "product_id": str(item["product_id"]),
                "sku": item["sku"],
                "name": item["product_name"],
                "quantity": item["quantity"],
                "price": _number(item["price"]),
                "line_total": _number(item["line_total"]),
            }
            for item in document["items"]
        ],
        "subtotal": _number(document["subtotal"]),
        "total": _number(document["total"]),
        "payment_method": document["payment_method"],
        "payment_status": document["payment_status"],
        "payment_order_id": document.get("payment_order_id"),
        "payment_reference": document.get("payment_reference"),
        "status": document["status"],
        "created_at": _iso(document["created_at"]),
        "paid_at": _iso(document.get("paid_at")),
        "payment_expired_at": _iso(document.get("payment_expired_at")),
        "reconciliation_status": document.get("reconciliation_status"),
        "cash": _number(document["cash_received"]) if document.get("cash_received") is not None else 0,
        "change": _number(document["change"]) if document.get("change") is not None else 0,
    }


def _iso(value):
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _audit(database, user_id, action, sale, details, session=None):
    database["audit_logs"].insert_one(
        {
            "user_id": user_id,
            "action": action,
            "entity": "sales",
            "entity_id": sale["_id"],
            "details": details,
            "created_at": datetime.now(timezone.utc),
        },
        session=session,
    )


def _build_items(products, raw_items, session):
    if not isinstance(raw_items, list) or not raw_items or len(raw_items) > 50:
        raise CheckoutError("invalid_items", message="Pilih satu atau lebih produk.")
    items = []
    seen = set()
    for row in raw_items:
        if not isinstance(row, dict) or not ObjectId.is_valid(row.get("product_id")):
            raise CheckoutError("invalid_product")
        product_id = ObjectId(row["product_id"])
        if product_id in seen:
            raise CheckoutError("duplicate_product")
        seen.add(product_id)
        quantity = row.get("quantity")
        if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity <= 0:
            raise CheckoutError("invalid_quantity")
        product = products.find_one({"_id": product_id}, session=session)
        if not product or not product.get("is_active", True):
            raise CheckoutError("product_unavailable", 409)
        if product["stock"] < quantity:
            raise CheckoutError("insufficient_stock", 409)
        price = _decimal(product["selling_price"])
        line_total = price * quantity
        items.append(
            {
                "product_id": product_id,
                "sku": product["sku"],
                "product_name": product["name"],
                "quantity": quantity,
                "price": Decimal128(str(price)),
                "line_total": Decimal128(str(line_total)),
            }
        )
    return items


def _active_shift(shifts, user, shift_id, session):
    if not ObjectId.is_valid(shift_id):
        raise CheckoutError("shift_not_open", 409)
    shift = shifts.find_one(
        {"_id": ObjectId(shift_id), "status": "open", "cashier_id": user["_id"]},
        session=session,
    )
    if not shift:
        raise CheckoutError("shift_not_open", 409)
    return shift


def _decrement_stock(database, sale, session):
    products = database["master_product"]
    for item in sale["items"]:
        updated = products.update_one(
            {
                "_id": item["product_id"],
                "is_active": True,
                "stock": {"$gte": item["quantity"]},
            },
            {"$inc": {"stock": -item["quantity"]}, "$set": {"updated_at": datetime.now(timezone.utc)}},
            session=session,
        )
        if updated.modified_count != 1:
            raise CheckoutError("insufficient_stock", 409)
        database["stock_movements"].insert_one(
            {
                "product_id": item["product_id"],
                "type": "sale",
                "quantity": -item["quantity"],
                "user_id": sale["cashier_id"],
                "reference_id": sale["_id"],
                "created_at": datetime.now(timezone.utc),
            },
            session=session,
        )


def _new_sale(data, user, database, session):
    if set(data) - {"items", "payment_method", "cash_received", "shift_id", "client_request_id"}:
        raise CheckoutError("unsupported_sale_fields")
    method = data.get("payment_method")
    if method not in {"cash", "online"}:
        raise CheckoutError("invalid_payment_method")
    request_id = data.get("client_request_id")
    if not isinstance(request_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", request_id):
        raise CheckoutError("invalid_client_request_id")
    shift = _active_shift(database["shifts"], user, data.get("shift_id"), session)
    items = _build_items(database["master_product"], data.get("items"), session)
    subtotal = sum((_decimal(item["line_total"]) for item in items), Decimal("0"))
    if subtotal != subtotal.to_integral_value():
        raise CheckoutError("invalid_currency_amount", message="Total pembayaran harus dalam rupiah bulat.")

    now = datetime.now(timezone.utc)
    sale_id = ObjectId()
    receipt = f"RTL-{now.astimezone(ZoneInfo('Asia/Jakarta')).strftime('%Y%m%d')}-{str(sale_id)[-6:].upper()}"
    sale = {
        "_id": sale_id,
        "receipt_number": receipt,
        "client_request_id": request_id,
        "cashier_id": user["_id"],
        "cashier_name": user["name"],
        "shift_id": shift["_id"],
        "items": items,
        "subtotal": Decimal128(str(subtotal)),
        "total": Decimal128(str(subtotal)),
        "payment_method": method,
        "payment_status": "not_started",
        "status": "pending",
        "created_at": now,
    }
    if method == "online":
        sale["payment_order_id"] = f"RTL-{sale_id}"[:50]
    else:
        cash = data.get("cash_received")
        if isinstance(cash, bool) or not isinstance(cash, (int, float, str)):
            raise CheckoutError("invalid_cash_received")
        try:
            cash_amount = Decimal(str(cash))
        except InvalidOperation:
            raise CheckoutError("invalid_cash_received") from None
        if not cash_amount.is_finite() or cash_amount < subtotal or cash_amount != cash_amount.to_integral_value():
            raise CheckoutError("cash_insufficient", message="Uang tunai harus bilangan bulat dan mencukupi.")
        sale["cash_received"] = Decimal128(str(cash_amount))
        sale["change"] = Decimal128(str(cash_amount - subtotal))

    database["sales"].insert_one(sale, session=session)
    if method == "cash":
        _decrement_stock(database, sale, session)
        sale.update(
            {
                "status": "completed",
                "payment_status": "paid",
                "paid_at": now,
            }
        )
        database["sales"].update_one(
            {"_id": sale_id},
            {"$set": {"status": "completed", "payment_status": "paid", "paid_at": now}},
            session=session,
        )
    updated_shift = database["shifts"].update_one(
        {"_id": shift["_id"], "status": "open"},
        {"$inc": {"activity_version": 1}},
        session=session,
    )
    if updated_shift.modified_count != 1:
        raise CheckoutError("shift_not_open", 409)
    _audit(database, user["_id"], "sale_created" if method == "online" else "sale_completed", sale,
           {"payment_method": method, "total": str(subtotal)}, session)
    return sale


def _create_payment_session(database, sale, user):
    sales = database["sales"]
    shifts = database["shifts"]
    client = database.client
    now = datetime.now(timezone.utc)
    with client.start_session() as session:
        with session.start_transaction():
            current = sales.find_one({"_id": sale["_id"]}, session=session)
            if current["status"] != "pending":
                raise CheckoutError("sale_not_pending", 409)
            if current.get("snap_token") and current["payment_status"] == "pending":
                return current
            if current["payment_status"] == "creating":
                raise CheckoutError("payment_session_creating", 409)
            if current["payment_status"] == "unknown":
                raise CheckoutError("payment_status_unknown", 409)
            if current["payment_status"] not in {"not_started", "failed"}:
                raise CheckoutError("payment_not_retryable", 409)
            shift = shifts.find_one({"_id": current["shift_id"], "status": "open"}, session=session)
            if not shift:
                raise CheckoutError("shift_not_open", 409)
            result = sales.update_one(
                {"_id": sale["_id"], "payment_status": current["payment_status"], "status": "pending"},
                {"$set": {"payment_status": "creating", "payment_creation_started_at": now},
                 "$unset": {"snap_token": "", "snap_redirect_url": ""}},
                session=session,
            )
            if result.modified_count != 1:
                raise CheckoutError("payment_session_creating", 409)
            shifts.update_one({"_id": shift["_id"], "status": "open"}, {"$inc": {"activity_version": 1}}, session=session)
            _audit(database, user["_id"], "payment_session_creating", current,
                   {"payment_order_id": current["payment_order_id"]}, session)
    try:
        snap = midtrans.create_snap_transaction(sale)
    except midtrans.MidtransError as error:
        sales.update_one(
            {"_id": sale["_id"], "payment_status": "creating"},
            {"$set": {"payment_status": "unknown", "payment_error_at": datetime.now(timezone.utc)}},
        )
        _audit(database, user["_id"], "payment_session_unknown", sale,
               {"payment_order_id": sale["payment_order_id"], "uncertain": error.uncertain})
        raise CheckoutError("payment_status_unknown", 503) from None
    created_at = datetime.now(timezone.utc)
    updated = sales.find_one_and_update(
        {"_id": sale["_id"], "payment_status": "creating", "status": "pending"},
        {"$set": {
            "payment_status": "pending",
            "payment_created_at": created_at,
            "payment_expired_at": created_at + timedelta(minutes=15),
            "snap_token": snap["token"],
            "snap_redirect_url": snap["redirect_url"],
        }},
        return_document=ReturnDocument.AFTER,
    )
    _audit(database, user["_id"], "payment_session_created", updated or sale,
           {"payment_order_id": sale["payment_order_id"]})
    return updated or sale


def _provider_state(payload):
    state = payload.get("transaction_status", "").lower()
    fraud = payload.get("fraud_status", "").lower()
    if state == "settlement" or (state == "capture" and fraud == "accept"):
        return "paid"
    if state == "capture" and fraud == "deny":
        return "failed"
    if state == "deny":
        return "failed"
    if state == "cancel":
        return "cancelled"
    if state == "expire":
        return "expired"
    if state == "pending":
        return "pending"
    return "unknown"


def _apply_provider_status(database, sale, payload, actor_id=None):
    order_id = payload.get("order_id")
    if order_id != sale.get("payment_order_id"):
        raise CheckoutError("payment_order_mismatch", 400)
    try:
        amount = Decimal(str(payload.get("gross_amount", "")))
    except InvalidOperation:
        raise CheckoutError("payment_amount_mismatch", 400) from None
    if amount != _decimal(sale["total"]):
        raise CheckoutError("payment_amount_mismatch", 400)
    if payload.get("currency") and payload["currency"] != "IDR":
        raise CheckoutError("payment_currency_mismatch", 400)
    provider_status = _provider_state(payload)
    sales = database["sales"]
    if sale["status"] == "completed" and sale["payment_status"] == "paid":
        return sale
    now = datetime.now(timezone.utc)
    reference = payload.get("transaction_id")

    if provider_status == "pending":
        sales.update_one(
            {"_id": sale["_id"], "status": "pending", "payment_status": {"$in": ["creating", "pending", "unknown"]}},
            {"$set": {"payment_status": "pending"}},
        )
        return sales.find_one({"_id": sale["_id"]})

    if provider_status == "failed":
        if sale["status"] == "pending":
            result = sales.update_one(
                {"_id": sale["_id"], "status": "pending", "payment_status": {"$in": ["creating", "pending", "unknown"]}},
                {"$set": {
                    "status": "voided", "payment_status": "failed",
                    "void_reason": "Pembayaran Midtrans gagal terverifikasi.",
                    "voided_by": None, "voided_at": now,
                    **({"payment_reference": reference} if reference else {}),
                }},
            )
            if result.modified_count:
                _audit(database, actor_id or sale["cashier_id"], "system_auto_void", sale,
                       {"source": "system", "payment_order_id": order_id})
        return sales.find_one({"_id": sale["_id"]})

    if provider_status == "cancelled":
        if sale["status"] == "pending":
            result = sales.update_one(
                {"_id": sale["_id"], "status": "pending",
                 "payment_status": {"$in": ["creating", "pending", "unknown"]}},
                {"$set": {
                    "status": "voided", "payment_status": "failed",
                    "void_reason": "Transaksi dibatalkan oleh Midtrans.",
                    "voided_by": None, "voided_at": now,
                    **({"payment_reference": reference} if reference else {}),
                }},
            )
            if result.modified_count:
                _audit(database, actor_id or sale["cashier_id"], "payment_cancelled", sale,
                       {"source": "midtrans", "payment_order_id": order_id})
        return sales.find_one({"_id": sale["_id"]})

    if provider_status == "expired":
        if sale["status"] == "pending":
            sales.update_one(
                {"_id": sale["_id"], "status": "pending", "payment_status": {"$in": ["creating", "pending", "unknown"]}},
                {"$set": {
                    "status": "expired", "payment_status": "expired", "expired_at": now,
                    **({"payment_reference": reference} if reference else {}),
                }},
            )
            _audit(database, actor_id or sale["cashier_id"], "payment_expired", sale,
                   {"payment_order_id": order_id})
        return sales.find_one({"_id": sale["_id"]})

    if provider_status == "paid":
        if sale["status"] == "voided":
            # A paid event that arrives after a terminal failure conflicts with the
            # prior provider result. Re-query Midtrans; never resurrect or decrement stock.
            try:
                verified = midtrans.get_transaction_status(sale["payment_order_id"])
            except midtrans.MidtransError:
                _audit(database, actor_id or sale["cashier_id"], "payment_conflict_unverified", sale,
                       {"payment_order_id": order_id, "incoming_status": "paid"})
                return sale
            if _provider_state(verified) == "paid":
                _audit(database, actor_id or sale["cashier_id"], "payment_late_detected", sale,
                       {"payment_order_id": order_id, "payment_reference": reference,
                        "reason": "provider_status_conflict_after_void"})
            return sale
        # Late payments and payments arriving after a closed shift are held for reconciliation.
        shift = database["shifts"].find_one({"_id": sale["shift_id"]})
        if sale["status"] == "expired" or not shift or shift["status"] != "open":
            if sale["status"] == "expired":
                sales.update_one({"_id": sale["_id"], "status": "expired"},
                                 {"$set": {"payment_status": "paid", "reconciliation_status": "pending",
                                           **({"payment_reference": reference} if reference else {})}})
                action = "payment_late_detected"
            else:
                sales.update_one({"_id": sale["_id"], "status": "pending"},
                                 {"$set": {"payment_status": "paid", "reconciliation_status": "pending",
                                           **({"payment_reference": reference} if reference else {})}})
                action = "payment_reconciliation_required"
            _audit(database, actor_id or sale["cashier_id"], action, sale,
                   {"payment_order_id": order_id, "payment_reference": reference})
            return sales.find_one({"_id": sale["_id"]})

        client = database.client
        try:
            with client.start_session() as session:
                with session.start_transaction():
                    current = sales.find_one({"_id": sale["_id"]}, session=session)
                    if current["status"] == "completed" and current["payment_status"] == "paid":
                        return current
                    if current["status"] != "pending":
                        raise CheckoutError("sale_not_pending", 409)
                    open_shift = database["shifts"].find_one(
                        {"_id": current["shift_id"], "status": "open"}, session=session
                    )
                    if not open_shift:
                        raise CheckoutError("shift_closed_before_payment", 409)
                    _decrement_stock(database, current, session)
                    update = {
                        "status": "completed", "payment_status": "paid", "paid_at": now,
                    }
                    if reference:
                        update["payment_reference"] = reference
                    sales.update_one({"_id": current["_id"], "status": "pending"}, {"$set": update}, session=session)
                    database["shifts"].update_one(
                        {"_id": open_shift["_id"], "status": "open"},
                        {"$inc": {"activity_version": 1}}, session=session
                    )
                    _audit(database, actor_id or current["cashier_id"], "sale_completed", current,
                           {"payment_method": "online", "payment_order_id": order_id,
                            "payment_reference": reference}, session)
        except (CheckoutError, PyMongoError) as error:
            # Provider has the money, but POS cannot safely complete the sale: never make stock negative.
            sales.update_one(
                {"_id": sale["_id"], "status": "pending"},
                {"$set": {"payment_status": "paid", "reconciliation_status": "pending",
                          **({"payment_reference": reference} if reference else {})}},
            )
            _audit(database, actor_id or sale["cashier_id"], "payment_reconciliation_required", sale,
                   {"payment_order_id": order_id, "payment_reference": reference,
                    "reason": "stock_or_shift_conflict"})
            current_app.logger.warning("Paid Midtrans sale held for reconciliation (%s)", sale["receipt_number"])
        return sales.find_one({"_id": sale["_id"]})

    sales.update_one(
        {"_id": sale["_id"], "status": "pending"},
        {"$set": {"payment_status": "unknown"}},
    )
    return sales.find_one({"_id": sale["_id"]})


def _refresh_expired_sales(database, rows, actor_id):
    now = datetime.now(timezone.utc)
    checked_before = now - timedelta(seconds=30)
    checks = 0
    for sale in rows:
        if checks >= 1:
            break
        expires_at = sale.get("payment_expired_at")
        if expires_at and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if (
            sale.get("payment_method") != "online"
            or sale.get("status") != "pending"
            or sale.get("payment_status") not in {"pending", "unknown"}
            or not expires_at
            or expires_at > now
        ):
            continue
        claim = database["sales"].find_one_and_update(
            {
                "_id": sale["_id"],
                "status": "pending",
                "payment_status": {"$in": ["pending", "unknown"]},
                "payment_expired_at": {"$lte": now},
                "$or": [
                    {"payment_status_checked_at": {"$exists": False}},
                    {"payment_status_checked_at": {"$lte": checked_before}},
                ],
            },
            {"$set": {"payment_status_checked_at": now}},
            return_document=ReturnDocument.AFTER,
        )
        if not claim:
            continue
        checks += 1
        try:
            provider = midtrans.get_transaction_status(claim["payment_order_id"])
            _apply_provider_status(database, claim, provider, actor_id)
        except midtrans.MidtransNotFound:
            continue
        except midtrans.MidtransError:
            continue
        except CheckoutError:
            current_app.logger.warning(
                "Could not reconcile expired payment for sale %s",
                sale["receipt_number"],
            )


@sales_bp.get("/payments/config")
def payments_config():
    user, error = _authorized_user()
    if error:
        return error
    return jsonify(payment=midtrans.public_config()), 200


@sales_bp.get("/sales")
def get_sales():
    user, error = _authorized_user()
    if error:
        return error
    try:
        _client, database = _database()
        query = {} if user["role"] == "manager" else {"cashier_id": user["_id"]}
        rows = list(database["sales"].find(query).sort("created_at", -1).limit(500))
        _refresh_expired_sales(database, rows, user["_id"])
        rows = database["sales"].find(query).sort("created_at", -1).limit(500)
        return jsonify(sales=[_public_sale(row) for row in rows]), 200
    except PyMongoError:
        current_app.logger.exception("Could not list sales")
        return jsonify(error="database_unavailable"), 503


@sales_bp.post("/sales")
def post_sale():
    user, error = _authorized_user()
    if error:
        return error
    if user["role"] != "cashier":
        return jsonify(error="cashier_role_required"), 403
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="json_object_required"), 400
    method = data.get("payment_method")
    if method == "online" and not midtrans.configured():
        return jsonify(error="payment_unavailable"), 503
    try:
        client, database = _database()
        _ensure_sales_indexes(database["sales"])
        request_id = data.get("client_request_id")
        if isinstance(request_id, str):
            existing = database["sales"].find_one({"client_request_id": request_id})
            if existing:
                if existing["cashier_id"] != user["_id"]:
                    return jsonify(error="sale_not_found"), 404
                if existing["payment_method"] == "online" and existing["status"] == "pending":
                    if existing["payment_status"] == "unknown":
                        try:
                            provider = midtrans.get_transaction_status(existing["payment_order_id"])
                            existing = _apply_provider_status(database, existing, provider, user["_id"])
                        except midtrans.MidtransNotFound:
                            database["sales"].update_one(
                                {"_id": existing["_id"], "payment_status": "unknown"},
                                {"$set": {"payment_status": "not_started"}},
                            )
                            existing = database["sales"].find_one({"_id": existing["_id"]})
                        except midtrans.MidtransError:
                            return jsonify(error="payment_status_unknown", sale=_public_sale(existing)), 503
                    if existing.get("payment_status") == "not_started":
                        existing = _create_payment_session(database, existing, user)
                    token = existing.get("snap_token") if existing.get("payment_status") == "pending" else None
                    return jsonify(sale=_public_sale(existing), snap_token=token), 200
                return jsonify(sale=_public_sale(existing)), 200

        with client.start_session() as session:
            with session.start_transaction():
                sale = _new_sale(data, user, database, session)
        if method == "online":
            sale = _create_payment_session(database, sale, user)
            token = sale.get("snap_token") if sale.get("payment_status") == "pending" else None
            if not token:
                return jsonify(error="payment_status_unknown", sale=_public_sale(sale)), 503
            return jsonify(sale=_public_sale(sale), snap_token=token), 201
        return jsonify(sale=_public_sale(sale)), 201
    except DuplicateKeyError:
        if isinstance(data.get("client_request_id"), str):
            existing = database["sales"].find_one({"client_request_id": data["client_request_id"]})
            if existing and existing["cashier_id"] == user["_id"]:
                return jsonify(sale=_public_sale(existing)), 200
        return jsonify(error="duplicate_sale"), 409
    except CheckoutError as error:
        return jsonify(error=error.code, message=str(error)), error.status
    except midtrans.MidtransError:
        current_app.logger.exception("Could not communicate with Midtrans Sandbox")
        return jsonify(error="payment_status_unknown"), 503
    except PyMongoError:
        current_app.logger.exception("Could not create sale")
        return jsonify(error="database_unavailable"), 503


def _sale_access(database, sale_id, user):
    if not ObjectId.is_valid(sale_id):
        raise CheckoutError("sale_not_found", 404)
    sale = database["sales"].find_one({"_id": ObjectId(sale_id)})
    if not sale or (user["role"] != "manager" and sale["cashier_id"] != user["_id"]):
        raise CheckoutError("sale_not_found", 404)
    return sale


@sales_bp.post("/sales/<sale_id>/payment-session")
def continue_payment(sale_id):
    user, error = _authorized_user()
    if error:
        return error
    try:
        _client, database = _database()
        sale = _sale_access(database, sale_id, user)
        if sale["payment_method"] != "online" or sale["status"] != "pending":
            raise CheckoutError("sale_not_pending", 409)
        if sale.get("payment_status") == "unknown":
            try:
                provider = midtrans.get_transaction_status(sale["payment_order_id"])
                sale = _apply_provider_status(database, sale, provider, user["_id"])
            except midtrans.MidtransNotFound:
                database["sales"].update_one({"_id": sale["_id"], "payment_status": "unknown"},
                                             {"$set": {"payment_status": "not_started"}})
                sale = database["sales"].find_one({"_id": sale["_id"]})
            except midtrans.MidtransError:
                raise CheckoutError("payment_status_unknown", 503) from None
        if sale.get("payment_status") == "not_started":
            sale = _create_payment_session(database, sale, user)
        if sale.get("payment_status") != "pending" or not sale.get("snap_token"):
            return jsonify(sale=_public_sale(sale)), 409
        return jsonify(sale=_public_sale(sale), snap_token=sale["snap_token"]), 200
    except CheckoutError as error:
        return jsonify(error=error.code, message=str(error)), error.status
    except PyMongoError:
        current_app.logger.exception("Could not continue sale payment")
        return jsonify(error="database_unavailable"), 503


def _mark_sale_cancelled(database, sale, user, provider=None):
    now = datetime.now(timezone.utc)
    updates = {
        "status": "voided",
        "payment_status": "failed",
        "void_reason": "Pesanan dibatalkan oleh pengguna.",
        "voided_by": user["_id"],
        "voided_at": now,
    }
    if provider and provider.get("transaction_id"):
        updates["payment_reference"] = provider["transaction_id"]
    result = database["sales"].update_one(
        {
            "_id": sale["_id"],
            "status": "pending",
            "payment_status": {"$in": ["not_started", "pending", "unknown"]},
        },
        {"$set": updates},
    )
    if result.modified_count:
        _audit(database, user["_id"], "sale_cancelled", sale,
               {"source": "user", "payment_order_id": sale.get("payment_order_id")})
    return database["sales"].find_one({"_id": sale["_id"]}) or sale


@sales_bp.post("/sales/<sale_id>/cancel")
def cancel_sale(sale_id):
    user, error = _authorized_user()
    if error:
        return error
    try:
        _client, database = _database()
        sale = _sale_access(database, sale_id, user)
        if sale["payment_method"] != "online" or sale["status"] != "pending":
            return jsonify(error="sale_not_pending", sale=_public_sale(sale)), 409
        if sale.get("payment_status") == "creating":
            return jsonify(error="payment_session_creating", sale=_public_sale(sale)), 409

        if sale.get("payment_status") == "not_started" and not sale.get("snap_token"):
            cancelled_sale = _mark_sale_cancelled(database, sale, user)
            return jsonify(sale=_public_sale(cancelled_sale), cancelled=cancelled_sale["status"] == "voided"), 200

        def apply_matching_status(payload):
            if payload.get("order_id") != sale["payment_order_id"]:
                current_app.logger.warning(
                    "Ignoring mismatched Midtrans order status for sale %s",
                    sale["receipt_number"],
                )
                return sale
            return _apply_provider_status(database, sale, payload, user["_id"])

        snap_session_cancelled = False
        if sale.get("snap_token"):
            try:
                midtrans.cancel_snap_session(sale["snap_token"])
                snap_session_cancelled = True
            except midtrans.MidtransError as error:
                # A missing token is already unusable; other errors may mean the
                # customer is completing payment, so verify transaction status below.
                snap_session_cancelled = error.status_code == 404

        try:
            provider = midtrans.get_transaction_status(sale["payment_order_id"])
        except midtrans.MidtransNotFound:
            if snap_session_cancelled:
                cancelled_sale = _mark_sale_cancelled(database, sale, user)
                return jsonify(sale=_public_sale(cancelled_sale), cancelled=cancelled_sale["status"] == "voided"), 200
            return jsonify(sale=_public_sale(sale), cancelled=False), 200
        except midtrans.MidtransError:
            return jsonify(sale=_public_sale(sale), cancelled=False), 200

        provider_state = _provider_state(provider)
        if provider_state == "paid":
            updated_sale = apply_matching_status(provider)
            return jsonify(sale=_public_sale(updated_sale), cancelled=False), 200
        if provider_state != "pending":
            updated_sale = apply_matching_status(provider)
            return jsonify(sale=_public_sale(updated_sale), cancelled=False), 200

        try:
            cancelled = midtrans.cancel_transaction(sale["payment_order_id"])
        except midtrans.MidtransError as provider_error:
            current_app.logger.info(
                "Midtrans cancel request did not complete for %s (HTTP/status %s)",
                sale["receipt_number"], provider_error.status_code or "unknown",
            )
            cancelled = None

        if cancelled and cancelled.get("transaction_status", "").lower() == "cancel":
            response_order_id = cancelled.get("order_id")
            if response_order_id and response_order_id != sale["payment_order_id"]:
                current_app.logger.warning(
                    "Ignoring mismatched Midtrans cancel response for sale %s",
                    sale["receipt_number"],
                )
            else:
                amount = cancelled.get("gross_amount")
                if amount is not None:
                    try:
                        amount_matches = Decimal(str(amount)) == _decimal(sale["total"])
                    except InvalidOperation:
                        amount_matches = False
                    if not amount_matches:
                        raise CheckoutError("payment_amount_mismatch", 400)
                cancelled_sale = _mark_sale_cancelled(database, sale, user, cancelled)
                return jsonify(
                    sale=_public_sale(cancelled_sale),
                    cancelled=cancelled_sale["status"] == "voided",
                ), 200

        try:
            latest = midtrans.get_transaction_status(sale["payment_order_id"])
        except midtrans.MidtransNotFound:
            if snap_session_cancelled:
                cancelled_sale = _mark_sale_cancelled(database, sale, user)
                return jsonify(
                    sale=_public_sale(cancelled_sale),
                    cancelled=cancelled_sale["status"] == "voided",
                ), 200
            return jsonify(sale=_public_sale(sale), cancelled=False), 200
        except midtrans.MidtransError:
            return jsonify(sale=_public_sale(sale), cancelled=False), 200

        latest_state = _provider_state(latest)
        if latest_state != "pending":
            updated_sale = apply_matching_status(latest)
            return jsonify(
                sale=_public_sale(updated_sale),
                cancelled=updated_sale["status"] == "voided",
            ), 200

        # Some payment channels reject Cancel while the transaction is pending.
        # Expire it as a fallback so the payment instruction cannot stay usable.
        try:
            expired = midtrans.expire_transaction(sale["payment_order_id"])
        except midtrans.MidtransError as provider_error:
            current_app.logger.warning(
                "Midtrans could not cancel or expire sale %s (status %s)",
                sale["receipt_number"], provider_error.status_code or "unknown",
            )
            return jsonify(sale=_public_sale(sale), cancelled=False), 200

        if (
            expired.get("transaction_status", "").lower() == "expire"
            and expired.get("order_id") == sale["payment_order_id"]
        ):
            amount = expired.get("gross_amount")
            if amount is not None:
                try:
                    amount_matches = Decimal(str(amount)) == _decimal(sale["total"])
                except InvalidOperation:
                    amount_matches = False
                if not amount_matches:
                    raise CheckoutError("payment_amount_mismatch", 400)
            cancelled_sale = _mark_sale_cancelled(database, sale, user, expired)
            return jsonify(
                sale=_public_sale(cancelled_sale),
                cancelled=cancelled_sale["status"] == "voided",
            ), 200

        updated_sale = apply_matching_status(expired)
        return jsonify(
            sale=_public_sale(updated_sale),
            cancelled=updated_sale["status"] == "voided",
        ), 200
    except CheckoutError as error:
        return jsonify(error=error.code, message=str(error)), error.status
    except PyMongoError:
        current_app.logger.exception("Could not cancel pending sale")
        return jsonify(error="database_unavailable"), 503


@sales_bp.get("/sales/<sale_id>/payment-status")
def refresh_payment_status(sale_id):
    user, error = _authorized_user()
    if error:
        return error
    try:
        _client, database = _database()
        sale = _sale_access(database, sale_id, user)
        # The browser only talks to Ritely. During the short checkout window,
        # let the backend verify Midtrans status as a fallback to webhook delay.
        if (
            request.args.get("verify_provider") == "1"
            and sale["payment_method"] == "online"
            and sale["status"] == "pending"
            and sale["payment_status"] in {"creating", "pending", "unknown"}
        ):
            now = datetime.now(timezone.utc)
            checked_before = now - timedelta(seconds=2)
            claim = database["sales"].find_one_and_update(
                {
                    "_id": sale["_id"],
                    "status": "pending",
                    "payment_status": {"$in": ["creating", "pending", "unknown"]},
                    "$or": [
                        {"payment_status_checked_at": {"$exists": False}},
                        {"payment_status_checked_at": {"$lte": checked_before}},
                    ],
                },
                {"$set": {"payment_status_checked_at": now}},
                return_document=ReturnDocument.AFTER,
            )
            if claim:
                try:
                    provider = midtrans.get_transaction_status(sale["payment_order_id"])
                    sale = _apply_provider_status(database, claim, provider, user["_id"])
                except midtrans.MidtransNotFound:
                    sale = claim
                except midtrans.MidtransError:
                    sale = claim
            else:
                sale = database["sales"].find_one({"_id": sale["_id"]}) or sale
        return jsonify(sale=_public_sale(sale)), 200
    except CheckoutError as error:
        return jsonify(error=error.code, message=str(error)), error.status
    except PyMongoError:
        current_app.logger.exception("Could not refresh sale payment status")
        return jsonify(error="database_unavailable"), 503


@sales_bp.post("/payments/midtrans/notification")
def midtrans_notification():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not midtrans.verify_notification_signature(payload):
        return jsonify(error="invalid_notification_signature"), 403
    try:
        _client, database = _database()
        sale = database["sales"].find_one({"payment_order_id": payload.get("order_id")})
        if not sale:
            return jsonify(error="sale_not_found"), 404
        _apply_provider_status(database, sale, payload)
        return jsonify(status="ok"), 200
    except CheckoutError as error:
        return jsonify(error=error.code), error.status
    except PyMongoError:
        current_app.logger.exception("Could not process Midtrans notification")
        return jsonify(error="database_unavailable"), 503
