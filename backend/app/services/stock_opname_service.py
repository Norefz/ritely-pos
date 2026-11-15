"""Stock opname submissions that immediately reconcile system stock."""

from datetime import datetime, timezone

from bson import ObjectId
from pymongo import ReturnDocument

from app.services.catalog_service import (
    CatalogItemNotFoundError,
    StockConflictError,
    _nonnegative_int,
)


def public_opname(document):
    return {
        "id": str(document["_id"]),
        "product_id": str(document["product_id"]),
        "sku": document["sku"],
        "product_name": document["product_name"],
        "system_stock": document["system_stock"],
        "physical_stock": document["physical_stock"],
        "difference": document["difference"],
        "status": document["status"],
        "submitted_by": str(document["submitted_by"]),
        "submitted_by_name": document["submitted_by_name"],
        "submitted_at": _isoformat(document["submitted_at"]),
    }


def _isoformat(value):
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def list_opnames(opnames, user):
    query = {} if user["role"] == "manager" else {"submitted_by": user["_id"]}
    return [
        public_opname(document)
        for document in opnames.find(query).sort("submitted_at", -1)
    ]


def submit_opname(opnames, products, movements, data, user, session=None):
    product_id = data.get("product_id")
    if not ObjectId.is_valid(product_id):
        raise ValueError("Produk tidak valid.")
    product = products.find_one({"_id": ObjectId(product_id)}, session=session)
    if not product or not product.get("is_active", True):
        raise CatalogItemNotFoundError

    system_stock = _nonnegative_int(data.get("system_stock"), "Stok sistem")
    latest_opname = opnames.find_one(
        {"product_id": product["_id"]},
        sort=[("submitted_at", -1)],
        session=session,
    )
    physical_stock = (
        latest_opname["physical_stock"]
        if latest_opname
        else product.get("physical_stock", product["stock"])
    )

    now = datetime.now(timezone.utc)
    difference = system_stock - product["stock"]
    updated_product = products.find_one_and_update(
        {"_id": product["_id"], "stock": product["stock"]},
        {
            "$set": {
                "stock": system_stock,
                "updated_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
        session=session,
    )
    if not updated_product:
        raise StockConflictError

    if difference:
        movements.insert_one(
            {
                "product_id": product["_id"],
                "type": "adjustment",
                "quantity": difference,
                "user_id": user["_id"],
                "created_at": now,
            },
            session=session,
        )

    document = {
        "product_id": product["_id"],
        "sku": product["sku"],
        "product_name": product["name"],
        "system_stock": product["stock"],
        "physical_stock": physical_stock,
        "difference": difference,
        "status": "completed",
        "submitted_by": user["_id"],
        "submitted_by_name": user["name"],
        "submitted_at": now,
    }
    result = opnames.insert_one(document, session=session)
    document["_id"] = result.inserted_id
    return public_opname(document)
