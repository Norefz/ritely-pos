"""MongoDB client helpers."""

from pymongo import MongoClient


_client = None
_client_uri = None


def get_client(uri, server_selection_timeout_ms=5000):
    """Return a cached Mongo client for the configured URI."""
    if not uri:
        raise ValueError("MONGO_URI belum diisi.")

    global _client, _client_uri
    if _client is None or _client_uri != uri:
        if _client is not None:
            _client.close()
        _client = MongoClient(
            uri,
            serverSelectionTimeoutMS=server_selection_timeout_ms,
        )
        _client_uri = uri
    return _client


def ping_mongodb(uri, server_selection_timeout_ms=5000):
    """Check connectivity with MongoDB using the standard ping command."""
    client = get_client(uri, server_selection_timeout_ms)
    client.admin.command("ping")
    return True


def get_database(uri, database_name, server_selection_timeout_ms=5000):
    """Return the configured application database."""
    if not database_name:
        raise ValueError("MONGO_DB_NAME belum diisi.")
    return get_client(uri, server_selection_timeout_ms)[database_name]
