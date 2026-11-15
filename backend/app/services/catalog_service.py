"""Validation and persistence for categories, products, and stock adjustments."""

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from bson import Decimal128, ObjectId
from pymongo import ReturnDocument


class CatalogItemNotFoundError(Exception):
    """A category or product referenced by a request does not exist."""


class InactiveCategoryError(ValueError):
    """A product cannot be assigned to an inactive category."""


class StockConflictError(Exception):
    """Stock changed while an adjustment was being saved."""


def _text(value, field):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} wajib diisi.")
    return value.strip()


def _nonnegative_int(value, field):
    if isinstance(value, bool):
        raise ValueError(f"{field} harus bilangan bulat ≥ 0.")
    try:
        integer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise ValueError(f"{field} harus bilangan bulat ≥ 0.") from error
    if str(value).strip() not in {str(integer), f"{integer}.0"} or integer < 0:
        raise ValueError(f"{field} harus bilangan bulat ≥ 0.")
    if integer > 2_147_483_647:
        raise ValueError(f"{field} melebihi batas Int32.")
    return integer


def _selling_price(value):
    try:
        price = Decimal(str(value))
        bson_price = Decimal128(str(price))
    except (InvalidOperation, ValueError, TypeError) as error:
        raise ValueError("Harga jual harus angka desimal yang valid.") from error
    if not price.is_finite() or price < 0:
        raise ValueError("Harga jual tidak boleh negatif.")
    return bson_price


def _category_id(value):
    if not ObjectId.is_valid(value):
        raise ValueError("category_id tidak valid.")
    return ObjectId(value)


def public_category(document):
    return {
        "id": str(document["_id"]),
        "name": document["name"],
        "is_active": document["is_active"],
    }


def public_product(document):
    price = document["selling_price"]
    if isinstance(price, Decimal128):
        price = str(price.to_decimal())
    return {
        "id": str(document["_id"]),
        "sku": document["sku"],
        "name": document["name"],
        "category_id": str(document["category_id"]),
        "selling_price": str(price),
        "stock": document["stock"],
        "physical_stock": document.get("physical_stock", document["stock"]),
        "minimum_stock": document["minimum_stock"],
        "is_active": document["is_active"],
        "created_at": _isoformat(document.get("created_at")),
        "updated_at": _isoformat(document.get("updated_at")),
    }


def _isoformat(value):
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def list_categories(collection, include_inactive=True):
    query = {} if include_inactive else {"is_active": True}
    return [
        public_category(document)
        for document in collection.find(query).sort("name", 1)
    ]


def list_products(collection, include_inactive=True):
    query = {} if include_inactive else {"is_active": True}
    return [
        public_product(document)
        for document in collection.find(query).sort("name", 1)
    ]


def _validated_product_fields(data, categories, creating=False):
    fields = {}
    if creating or "name" in data:
        fields["name"] = _text(data.get("name"), "Nama produk")
    if creating or "sku" in data:
        fields["sku"] = _text(data.get("sku"), "SKU").upper()
    if creating or "category_id" in data:
        category_id = _category_id(data.get("category_id"))
        category = categories.find_one({"_id": category_id})
        if not category:
            raise ValueError("Kategori tidak ditemukan.")
        if not category.get("is_active", True):
            raise InactiveCategoryError("Pilih kategori yang masih aktif.")
        fields["category_id"] = category_id
    if creating or "selling_price" in data:
        fields["selling_price"] = _selling_price(data.get("selling_price"))
    if creating or "minimum_stock" in data:
        fields["minimum_stock"] = _nonnegative_int(
            data.get("minimum_stock"), "Stok minimum"
        )
    if "is_active" in data or creating:
        active = data.get("is_active", True)
        if not isinstance(active, bool):
            raise ValueError("is_active harus berupa boolean.")
        fields["is_active"] = active
    return fields


def create_category(collection, data, session=None):
    name = _text(data.get("name"), "Nama kategori")
    document = {"name": name, "is_active": True}
    result = collection.insert_one(document, session=session)
    document["_id"] = result.inserted_id
    return public_category(document)


def update_category(collection, category_id, data, session=None):
    if not ObjectId.is_valid(category_id):
        raise CatalogItemNotFoundError
    updates = {}
    if "name" in data:
        updates["name"] = _text(data["name"], "Nama kategori")
    if "is_active" in data:
        if not isinstance(data["is_active"], bool):
            raise ValueError("is_active harus berupa boolean.")
        updates["is_active"] = data["is_active"]
    if not updates:
        raise ValueError("Tidak ada perubahan kategori.")
    result = collection.find_one_and_update(
        {"_id": ObjectId(category_id)},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
        session=session,
    )
    if not result:
        raise CatalogItemNotFoundError
    return public_category(result)


def create_product(products, categories, data, session=None):
    if "stock" in data:
        raise ValueError("Stok awal diatur melalui penyesuaian stok.")
    document = _validated_product_fields(data, categories, creating=True)
    now = datetime.now(timezone.utc)
    document.update(
        {
            "stock": 0,
            "physical_stock": 0,
            "created_at": now,
            "updated_at": now,
        }
    )
    result = products.insert_one(document, session=session)
    document["_id"] = result.inserted_id
    return public_product(document)


def update_product(products, categories, product_id, data, session=None):
    if not ObjectId.is_valid(product_id):
        raise CatalogItemNotFoundError
    allowed = {"name", "sku", "category_id", "selling_price", "minimum_stock", "is_active"}
    if set(data) - allowed:
        raise ValueError("Field produk tidak didukung.")
    updates = _validated_product_fields(data, categories)
    if not updates:
        raise ValueError("Tidak ada perubahan produk.")
    updates["updated_at"] = datetime.now(timezone.utc)
    result = products.find_one_and_update(
        {"_id": ObjectId(product_id)},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
        session=session,
    )
    if not result:
        raise CatalogItemNotFoundError
    return public_product(result)


def adjust_product_stock(products, product_id, target_stock, actor, session=None):
    if not ObjectId.is_valid(product_id):
        raise CatalogItemNotFoundError
    target_stock = _nonnegative_int(target_stock, "Stok akhir")
    current = products.find_one({"_id": ObjectId(product_id)}, session=session)
    if not current:
        raise CatalogItemNotFoundError
    difference = target_stock - current["stock"]
    if difference == 0:
        raise ValueError("Stok akhir sama dengan stok saat ini.")
    updated = products.find_one_and_update(
        {"_id": current["_id"], "stock": current["stock"]},
        {
            "$set": {
                "stock": target_stock,
                "physical_stock": target_stock,
                "updated_at": datetime.now(timezone.utc),
            }
        },
        return_document=ReturnDocument.AFTER,
        session=session,
    )
    if not updated:
        raise StockConflictError
    movement = {
        "product_id": current["_id"],
        "type": "adjustment",
        "quantity": difference,
        "user_id": actor["_id"],
        "created_at": datetime.now(timezone.utc),
    }
    return public_product(updated), movement, difference
