"""Create MongoDB indexes once during database setup."""

from pymongo.collation import Collation


def ensure_indexes(database):
    users = database["users"]
    users.create_index("username", unique=True, name="uq_users_username")
    users.create_index(
        "employee_id",
        unique=True,
        sparse=True,
        name="uq_users_employee_id",
    )

    shifts = database["shifts"]
    shifts.create_index(
        "active_lock",
        unique=True,
        partialFilterExpression={"status": "open"},
        name="uq_one_open_shift_per_store",
    )
    shifts.create_index(
        "status",
        unique=True,
        partialFilterExpression={"status": "open"},
        name="uq_one_open_shift_by_status",
    )
    shifts.create_index("opened_at", name="idx_shifts_opened_at")
    shifts.create_index(
        [("cashier_id", 1), ("opened_at", 1)],
        name="idx_shifts_cashier_opened_at",
    )

    revoked_tokens = database["revoked_tokens"]
    revoked_tokens.create_index(
        "jti", unique=True, name="uq_revoked_tokens_jti"
    )
    revoked_tokens.create_index(
        "expires_at", expireAfterSeconds=0, name="ttl_revoked_tokens_expiry"
    )

    database["categories"].create_index(
        [("name", 1)],
        unique=True,
        collation=Collation(locale="en", strength=2),
        name="uq_categories_name_ci",
    )

    products = database["master_product"]
    products.create_index("sku", unique=True, name="uq_master_product_sku")
    products.create_index(
        [("category_id", 1), ("is_active", 1)],
        name="idx_master_product_category_active",
    )

    database["stock_movements"].create_index(
        [("product_id", 1), ("created_at", -1)],
        name="idx_stock_movements_product_created",
    )

    opnames = database["stock_opnames"]
    opnames.create_index(
        [("submitted_at", -1)],
        name="idx_stock_opnames_submitted_at",
    )
    opnames.create_index(
        [("submitted_by", 1), ("submitted_at", -1)],
        name="idx_stock_opnames_submitter_time",
    )

    sales = database["sales"]
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
        [("cashier_id", 1), ("created_at", -1)],
        name="idx_sales_cashier_created",
    )
