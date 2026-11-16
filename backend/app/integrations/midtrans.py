"""Small server-side client for Midtrans Snap and transaction status APIs."""

import base64
import json
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from flask import current_app


class MidtransError(Exception):
    def __init__(self, message, *, uncertain=False, status_code=None):
        super().__init__(message)
        self.uncertain = uncertain
        self.status_code = status_code


class MidtransNotFound(MidtransError):
    """Provider has no transaction record for this order ID."""


def configured():
    return bool(
        current_app.config.get("MIDTRANS_SERVER_KEY")
        and current_app.config.get("MIDTRANS_CLIENT_KEY")
    )


def public_config():
    enabled = configured()
    return {
        "enabled": enabled,
        "client_key": current_app.config.get("MIDTRANS_CLIENT_KEY", "") if enabled else "",
        "script_url": "https://app.sandbox.midtrans.com/snap/snap.js",
    }


def _request(url, method="GET", body=None):
    server_key = current_app.config.get("MIDTRANS_SERVER_KEY", "")
    if not server_key:
        raise MidtransError("Midtrans Sandbox belum dikonfigurasi.")
    auth = base64.b64encode(f"{server_key}:".encode()).decode()
    data = json.dumps(body).encode() if body is not None else None
    request = Request(
        url,
        data=data,
        method=method,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Basic {auth}",
        },
    )
    try:
        with urlopen(
            request,
            timeout=current_app.config.get("MIDTRANS_TIMEOUT_SECONDS", 12),
        ) as response:
            payload = json.loads(response.read().decode())
            return payload
    except HTTPError as error:
        error.read()
        if error.code == 404 and method == "GET":
            raise MidtransNotFound("Transaksi belum tercatat di Midtrans.", status_code=404) from None
        # Provider rejected a definite request; keep the error body out of logs/API.
        raise MidtransError("Midtrans menolak permintaan pembayaran.", status_code=error.code) from None
    except (TimeoutError, URLError, OSError) as error:
        raise MidtransError("Hasil permintaan Midtrans belum diketahui.", uncertain=True) from error
    except (ValueError, json.JSONDecodeError) as error:
        raise MidtransError("Respons Midtrans tidak dapat dibaca.", uncertain=True) from error


def create_snap_transaction(sale):
    order_id = sale["payment_order_id"]
    base_url = "https://app.sandbox.midtrans.com/snap/v1/transactions"
    payload = {
        "transaction_details": {
            "order_id": order_id,
            "gross_amount": int(sale["total"].to_decimal()),
        },
        "item_details": [
            {
                "id": item["sku"],
                "price": int(item["price"].to_decimal()),
                "quantity": item["quantity"],
                "name": item["product_name"][:50],
            }
            for item in sale["items"]
        ],
        "expiry": {
            "start_time": datetime.now(timezone.utc).astimezone(ZoneInfo("Asia/Jakarta")).strftime("%Y-%m-%d %H:%M:%S +0700"),
            "unit": "minutes",
            "duration": 15,
        },
        "page_expiry": {"unit": "minutes", "duration": 15},
    }
    started_at = time.monotonic()
    try:
        result = _request(base_url, "POST", payload)
    finally:
        elapsed_ms = round((time.monotonic() - started_at) * 1000)
        current_app.logger.info("Midtrans Snap session request completed in %d ms", elapsed_ms)
    token = result.get("token")
    redirect_url = result.get("redirect_url")
    if not token or not redirect_url:
        raise MidtransError("Midtrans tidak mengembalikan sesi pembayaran.", uncertain=True)
    return {"token": token, "redirect_url": redirect_url}


def get_transaction_status(order_id):
    url = "https://api.sandbox.midtrans.com/v2/" + quote(order_id, safe="") + "/status"
    return _request(url)


def cancel_transaction(order_id):
    url = "https://api.sandbox.midtrans.com/v2/" + quote(order_id, safe="") + "/cancel"
    return _request(url, "POST", {})


def cancel_snap_session(token):
    server_key = current_app.config.get("MIDTRANS_SERVER_KEY", "")
    if not server_key:
        raise MidtransError("Midtrans Sandbox belum dikonfigurasi.")
    url = "https://app.sandbox.midtrans.com/snap/v1/transactions/" + quote(token, safe="") + "/cancel"
    request = Request(
        url,
        data=b"{}",
        method="POST",
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": server_key,
        },
    )
    try:
        with urlopen(
            request,
            timeout=current_app.config.get("MIDTRANS_TIMEOUT_SECONDS", 12),
        ) as response:
            payload = json.loads(response.read().decode())
            return payload
    except HTTPError as error:
        error.read()
        raise MidtransError("Sesi pembayaran Midtrans tidak dapat dibatalkan.", status_code=error.code) from None
    except (TimeoutError, URLError, OSError) as error:
        raise MidtransError("Hasil pembatalan sesi Midtrans belum diketahui.", uncertain=True) from error
    except (ValueError, json.JSONDecodeError) as error:
        raise MidtransError("Respons pembatalan Midtrans tidak dapat dibaca.", uncertain=True) from error


def verify_notification_signature(payload):
    import hashlib
    import hmac

    # Some Midtrans dashboards expose a dedicated Signature Secret Key
    # separately from the API Server Keys. Preserve support for legacy setups.
    server_key = (
        current_app.config.get("MIDTRANS_SIGNATURE_SECRET_KEY", "")
        or current_app.config.get("MIDTRANS_SERVER_KEY", "")
    )
    required = ("order_id", "status_code", "gross_amount", "signature_key")
    if not server_key or any(not payload.get(key) for key in required):
        return False
    raw = (
        str(payload["order_id"])
        + str(payload["status_code"])
        + str(payload["gross_amount"])
        + server_key
    ).encode()
    expected = hashlib.sha512(raw).hexdigest()
    return hmac.compare_digest(expected, str(payload["signature_key"]))
