
import base64
import re
from datetime import datetime
from zoneinfo import ZoneInfo

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


def _config():
    environment = settings.MPESA_ENVIRONMENT.lower()

    if environment == "sandbox":
        base_url = "https://sandbox.safaricom.co.ke"
    elif environment == "production":
        base_url = "https://api.safaricom.co.ke"
    else:
        raise ImproperlyConfigured(
            "MPESA_ENVIRONMENT must be sandbox or production."
        )

    required = [
        settings.MPESA_CONSUMER_KEY,
        settings.MPESA_CONSUMER_SECRET,
        settings.MPESA_SHORTCODE,
        settings.MPESA_PASSKEY,
        settings.MPESA_CALLBACK_BASE_URL,
        settings.MPESA_CALLBACK_SECRET,
    ]

    if not all(required):
        raise ImproperlyConfigured(
            "M-Pesa credentials and callback configuration are required."
        )

    if not settings.MPESA_CALLBACK_BASE_URL.startswith("https://"):
        raise ImproperlyConfigured(
            "The M-Pesa callback URL must use HTTPS."
        )

    return base_url


def normalize_ke_phone(value):
    """Normalize common Kenyan phone formats to 254XXXXXXXXX."""
    phone = re.sub(r"[\s()+-]", "", str(value or ""))

    if phone.startswith("0") and len(phone) == 10:
        phone = "254" + phone[1:]
    elif phone.startswith("7") and len(phone) == 9:
        phone = "254" + phone
    elif phone.startswith("1") and len(phone) == 9:
        phone = "254" + phone

    if not re.fullmatch(r"254[17]\d{8}", phone):
        raise ValueError("Enter a valid Kenyan M-Pesa phone number.")

    return phone


def _access_token():
    base_url = _config()

    response = requests.get(
        f"{base_url}/oauth/v1/generate",
        params={"grant_type": "client_credentials"},
        auth=(
            settings.MPESA_CONSUMER_KEY,
            settings.MPESA_CONSUMER_SECRET,
        ),
        timeout=settings.MPESA_TIMEOUT_SECONDS,
    )
    response.raise_for_status()

    data = response.json()
    token = data.get("access_token")

    if not token:
        raise ValueError("Daraja did not return an access token.")

    return base_url, token


def initiate_stk_push(*, payment, phone_number):
    """
    Initiate an STK Push for an existing pending Payment.

    A successful response means the request was accepted, not that
    the customer has paid. Completion happens through the callback.
    """
    base_url, token = _access_token()

    # Daraja STK Push amounts are whole KES, not decimal cents.
    if payment.amount != payment.amount.to_integral_value():
        raise ValueError(
            "M-Pesa STK Push amounts must be whole Kenyan shillings."
        )

    phone = normalize_ke_phone(phone_number)
    shortcode = str(settings.MPESA_SHORTCODE)
    timestamp = datetime.now(
        ZoneInfo("Africa/Nairobi")
    ).strftime("%Y%m%d%H%M%S")

    password_source = (
        shortcode + settings.MPESA_PASSKEY + timestamp
    )
    password = base64.b64encode(
        password_source.encode("utf-8")
    ).decode("utf-8")

    # Keep the account reference within Daraja's short reference limit.
    account_reference = payment.order.order_number[:12]
    callback_url = (
        f"{settings.MPESA_CALLBACK_BASE_URL}/"
        f"{settings.MPESA_CALLBACK_SECRET}/"
    )

    payload = {
        "BusinessShortCode": shortcode,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": settings.MPESA_TRANSACTION_TYPE,
        "Amount": int(payment.amount),
        "PartyA": phone,
        "PartyB": shortcode,
        "PhoneNumber": phone,
        "CallBackURL": callback_url,
        "AccountReference": account_reference,
        "TransactionDesc": "Furniture order",
    }

    response = requests.post(
        f"{base_url}/mpesa/stkpush/v1/processrequest",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=settings.MPESA_TIMEOUT_SECONDS,
    )
    response.raise_for_status()

    data = response.json()

    if str(data.get("ResponseCode")) != "0":
        raise ValueError(
            data.get("ResponseDescription", "STK Push was rejected.")
        )

    checkout_id = data.get("CheckoutRequestID")
    merchant_id = data.get("MerchantRequestID")

    if not checkout_id or not merchant_id:
        raise ValueError(
            "Daraja response did not include the expected request IDs."
        )

    return {
        "checkout_id": checkout_id,
        "merchant_id": merchant_id,
        "customer_message": data.get(
            "CustomerMessage",
            "Check your phone to complete the M-Pesa payment.",
        ),
    }