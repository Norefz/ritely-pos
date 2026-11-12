"""Assign employee IDs to existing cashier accounts."""

import re

from app.config import Config
from app.database.mongo import get_client, get_database


EMPLOYEE_ID_PATTERN = re.compile(r"^KSR-(\d+)$")


def main():
    client = get_client(
        Config.MONGO_URI,
        Config.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    )
    database = get_database(
        Config.MONGO_URI,
        Config.MONGO_DB_NAME,
        Config.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    )
    users = database["users"]
    users.create_index(
        "employee_id",
        unique=True,
        sparse=True,
        name="uq_users_employee_id",
    )
    counters = database["counters"]
    assigned = []

    with client.start_session() as session:
        with session.start_transaction():
            counter = counters.find_one(
                {"_id": "cashier_employee_id"}, session=session
            )
            sequence = counter.get("value", 0) if counter else 0
            cashiers = list(
                users.find({"role": "cashier"}, session=session).sort(
                    [("created_at", 1), ("_id", 1)]
                )
            )

            for cashier in cashiers:
                existing_id = cashier.get("employee_id")
                if existing_id:
                    match = EMPLOYEE_ID_PATTERN.fullmatch(existing_id)
                    if match:
                        sequence = max(sequence, int(match.group(1)))

            for cashier in cashiers:
                if cashier.get("employee_id"):
                    continue
                sequence += 1
                employee_id = f"KSR-{sequence:04d}"
                users.update_one(
                    {"_id": cashier["_id"]},
                    {"$set": {"employee_id": employee_id}},
                    session=session,
                )
                assigned.append(employee_id)

            counters.update_one(
                {"_id": "cashier_employee_id"},
                {"$max": {"value": sequence}},
                upsert=True,
                session=session,
            )

    print(f"Assigned employee IDs to {len(assigned)} cashier account(s).")
    for employee_id in assigned:
        print(employee_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
