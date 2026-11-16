"""Catalog, stock adjustment, and stock opname endpoints."""

from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, Response, current_app, g, jsonify, request
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.database.catalog import (
    get_catalog_database,
    get_categories_collection,
    get_products_collection,
    get_stock_movements_collection,
    get_stock_opnames_collection,
)
from app.database.mongo import get_client
from app.middleware.auth import authenticate_request, manager_required
from app.services.catalog_service import (
    CatalogItemNotFoundError,
    InactiveCategoryError,
    StockConflictError,
    adjust_product_stock,
    create_category,
    create_product,
    list_categories,
    list_products,
    update_category,
    update_product,
)
from app.services.stock_opname_service import (
    list_opnames,
    submit_opname,
)


catalog_bp = Blueprint("catalog", __name__, url_prefix="/api")


def _mongo_client():
    return get_client(
        current_app.config["MONGO_URI"],
        current_app.config["MONGO_SERVER_SELECTION_TIMEOUT_MS"],
    )


def _audit_log(session, user, action, entity, entity_id, details):
    get_catalog_database()["audit_logs"].insert_one(
        {
            "user_id": user["_id"],
            "action": action,
            "entity": entity,
            "entity_id": entity_id,
            "details": details,
            "created_at": datetime.now(timezone.utc),
        },
        session=session,
    )


def _current_user():
    if not current_app.config.get("JWT_SECRET_KEY"):
        return None, (jsonify(error="auth_not_configured"), 503)
    try:
        user, _ = authenticate_request()
    except (PyMongoError, ValueError):
        current_app.logger.exception("Catalog request could not authenticate user")
        return None, (jsonify(error="database_unavailable"), 503)
    if not user:
        return None, (jsonify(error="authentication_required"), 401)
    return user, None


def _json_object():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, (jsonify(error="json_object_required"), 400)
    return data, None


def _latest_physical_counts():
    rows = get_stock_opnames_collection().aggregate(
        [
            {"$sort": {"submitted_at": -1}},
            {
                "$group": {
                    "_id": "$product_id",
                    "physical_stock": {"$first": "$physical_stock"},
                }
            },
        ]
    )
    return {str(row["_id"]): row["physical_stock"] for row in rows}


@catalog_bp.get("/catalog")
def get_catalog():
    user, error = _current_user()
    if error:
        return error
    include_inactive = user["role"] == "manager"
    try:
        products = get_products_collection()
        return jsonify(
            products=list_products(
                products,
                include_inactive,
                physical_counts=_latest_physical_counts(),
            ),
            categories=list_categories(get_categories_collection(), include_inactive),
        ), 200
    except PyMongoError:
        current_app.logger.exception("Could not load product catalog")
        return jsonify(error="database_unavailable"), 503


@catalog_bp.get("/products")
def get_products():
    user, error = _current_user()
    if error:
        return error
    try:
        products_collection = get_products_collection()
        products = list_products(
            products_collection,
            user["role"] == "manager",
            physical_counts=_latest_physical_counts(),
        )
        return jsonify(products=products), 200
    except PyMongoError:
        current_app.logger.exception("Could not list products")
        return jsonify(error="database_unavailable"), 503


@catalog_bp.get("/products/<product_id>/image")
def get_product_image(product_id):
    # Product photos are public catalog assets and must load in ordinary <img> tags.
    if not ObjectId.is_valid(product_id):
        return jsonify(error="product_not_found"), 404
    try:
        product = get_products_collection().find_one(
            {"_id": ObjectId(product_id)},
            {"image_data": 1, "image_content_type": 1},
        )
    except PyMongoError:
        current_app.logger.exception("Could not load product image")
        return jsonify(error="database_unavailable"), 503
    if not product or not product.get("image_data"):
        return jsonify(error="product_image_not_found"), 404
    response = Response(
        bytes(product["image_data"]),
        content_type=product.get("image_content_type", "application/octet-stream"),
    )
    response.headers["Cache-Control"] = "public, max-age=0, must-revalidate"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@catalog_bp.post("/products")
@manager_required
def post_product():
    data, error = _json_object()
    if error:
        return error
    try:
        products_collection = get_products_collection()
        categories_collection = get_categories_collection()
        movements_collection = get_stock_movements_collection()
        client = _mongo_client()
        with client.start_session() as session:
            with session.start_transaction():
                product = create_product(
                    products_collection,
                    categories_collection,
                    data,
                    session=session,
                )
                if product["stock"]:
                    movements_collection.insert_one(
                        {
                            "product_id": ObjectId(product["id"]),
                            "type": "opening_balance",
                            "quantity": product["stock"],
                            "user_id": g.current_user["_id"],
                            "created_at": datetime.now(timezone.utc),
                        },
                        session=session,
                    )
                _audit_log(
                    session,
                    g.current_user,
                    "product_created",
                    "master_product",
                    ObjectId(product["id"]),
                    {
                        "sku": product["sku"],
                        "name": product["name"],
                        "initial_stock": product["stock"],
                    },
                )
    except DuplicateKeyError:
        return jsonify(error="sku_taken"), 409
    except InactiveCategoryError as error:
        return jsonify(error="inactive_category", message=str(error)), 409
    except CatalogItemNotFoundError:
        return jsonify(error="catalog_item_not_found"), 404
    except ValueError as error:
        return jsonify(error="invalid_product", message=str(error)), 400
    except PyMongoError:
        current_app.logger.exception("Could not create product")
        return jsonify(error="database_unavailable"), 503
    return jsonify(product=product), 201


@catalog_bp.patch("/products/<product_id>")
@manager_required
def patch_product(product_id):
    data, error = _json_object()
    if error:
        return error
    try:
        products_collection = get_products_collection()
        categories_collection = get_categories_collection()
        client = _mongo_client()
        with client.start_session() as session:
            with session.start_transaction():
                product = update_product(
                    products_collection,
                    categories_collection,
                    product_id,
                    data,
                    session=session,
                )
                _audit_log(
                    session,
                    g.current_user,
                    "product_updated",
                    "master_product",
                    ObjectId(product["id"]),
                    {"changed_fields": sorted(data), "sku": product["sku"]},
                )
    except DuplicateKeyError:
        return jsonify(error="sku_taken"), 409
    except InactiveCategoryError as error:
        return jsonify(error="inactive_category", message=str(error)), 409
    except CatalogItemNotFoundError:
        return jsonify(error="product_not_found"), 404
    except ValueError as error:
        return jsonify(error="invalid_product", message=str(error)), 400
    except PyMongoError:
        current_app.logger.exception("Could not update product")
        return jsonify(error="database_unavailable"), 503
    return jsonify(product=product), 200


@catalog_bp.get("/categories")
def get_categories():
    user, error = _current_user()
    if error:
        return error
    try:
        return jsonify(
            categories=list_categories(
                get_categories_collection(), user["role"] == "manager"
            )
        ), 200
    except PyMongoError:
        current_app.logger.exception("Could not list categories")
        return jsonify(error="database_unavailable"), 503


@catalog_bp.post("/categories")
@manager_required
def post_category():
    data, error = _json_object()
    if error:
        return error
    try:
        categories_collection = get_categories_collection()
        client = _mongo_client()
        with client.start_session() as session:
            with session.start_transaction():
                category = create_category(
                    categories_collection, data, session=session
                )
                _audit_log(
                    session,
                    g.current_user,
                    "category_created",
                    "categories",
                    ObjectId(category["id"]),
                    {"name": category["name"]},
                )
    except DuplicateKeyError:
        return jsonify(error="category_name_taken"), 409
    except ValueError as error:
        return jsonify(error="invalid_category", message=str(error)), 400
    except PyMongoError:
        current_app.logger.exception("Could not create category")
        return jsonify(error="database_unavailable"), 503
    return jsonify(category=category), 201


@catalog_bp.patch("/categories/<category_id>")
@manager_required
def patch_category(category_id):
    data, error = _json_object()
    if error:
        return error
    try:
        categories_collection = get_categories_collection()
        client = _mongo_client()
        with client.start_session() as session:
            with session.start_transaction():
                category = update_category(
                    categories_collection,
                    category_id,
                    data,
                    session=session,
                )
                _audit_log(
                    session,
                    g.current_user,
                    "category_updated",
                    "categories",
                    ObjectId(category["id"]),
                    {"changed_fields": sorted(data)},
                )
    except DuplicateKeyError:
        return jsonify(error="category_name_taken"), 409
    except CatalogItemNotFoundError:
        return jsonify(error="category_not_found"), 404
    except ValueError as error:
        return jsonify(error="invalid_category", message=str(error)), 400
    except PyMongoError:
        current_app.logger.exception("Could not update category")
        return jsonify(error="database_unavailable"), 503
    return jsonify(category=category), 200


@catalog_bp.post("/products/<product_id>/stock-adjustments")
@manager_required
def post_stock_adjustment(product_id):
    data, error = _json_object()
    if error:
        return error
    reason = data.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        return jsonify(error="adjustment_reason_required"), 400
    try:
        products_collection = get_products_collection()
        movements_collection = get_stock_movements_collection()
        client = _mongo_client()
        with client.start_session() as session:
            with session.start_transaction():
                product, movement, difference = adjust_product_stock(
                    products_collection,
                    product_id,
                    data.get("stock"),
                    g.current_user,
                    session=session,
                )
                movements_collection.insert_one(movement, session=session)
                _audit_log(
                    session,
                    g.current_user,
                    "stock_adjusted",
                    "master_product",
                    ObjectId(product["id"]),
                    {"quantity": difference, "reason": reason.strip()},
                )
    except CatalogItemNotFoundError:
        return jsonify(error="product_not_found"), 404
    except StockConflictError:
        return jsonify(error="stock_changed_retry"), 409
    except ValueError as error:
        return jsonify(error="invalid_stock_adjustment", message=str(error)), 400
    except PyMongoError:
        current_app.logger.exception("Could not adjust product stock")
        return jsonify(error="database_unavailable"), 503
    return jsonify(product=product), 200


@catalog_bp.get("/stock-opnames")
@manager_required
def get_stock_opnames():
    try:
        return jsonify(
            opnames=list_opnames(
                get_stock_opnames_collection(), g.current_user
            )
        ), 200
    except PyMongoError:
        current_app.logger.exception("Could not list stock opnames")
        return jsonify(error="database_unavailable"), 503


@catalog_bp.post("/stock-opnames")
def post_stock_opname():
    user, auth_error = _current_user()
    if auth_error:
        return auth_error
    if user["role"] not in {"cashier", "manager"}:
        return jsonify(error="stock_opname_role_required"), 403
    data, error = _json_object()
    if error:
        return error
    allowed = {"product_id", "system_stock"}
    if set(data) - allowed:
        return jsonify(error="unsupported_stock_opname_fields"), 400
    try:
        opnames_collection = get_stock_opnames_collection()
        products_collection = get_products_collection()
        movements_collection = get_stock_movements_collection()
        client = _mongo_client()
        with client.start_session() as session:
            with session.start_transaction():
                opname = submit_opname(
                    opnames_collection,
                    products_collection,
                    movements_collection,
                    data,
                    user,
                    session=session,
                )
                _audit_log(
                    session,
                    user,
                    "stock_opname_completed",
                    "stock_opnames",
                    ObjectId(opname["id"]),
                    {
                        "product_id": ObjectId(opname["product_id"]),
                        "system_stock": opname["system_stock"],
                        "new_system_stock": opname["system_stock"] + opname["difference"],
                        "physical_stock": opname["physical_stock"],
                        "difference": opname["difference"],
                    },
                )
    except CatalogItemNotFoundError:
        return jsonify(error="product_not_found"), 404
    except StockConflictError:
        return jsonify(error="stock_changed_retry"), 409
    except ValueError as error:
        return jsonify(error="invalid_stock_opname", message=str(error)), 400
    except PyMongoError:
        current_app.logger.exception("Could not submit stock opname")
        return jsonify(error="database_unavailable"), 503
    return jsonify(opname=opname), 201
