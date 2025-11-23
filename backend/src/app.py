import json
import os
import uuid
import logging
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")

# One org per deployment / stack
ORGANIZATION_ID = os.environ.get("ORGANIZATION_ID", "org_pilot")

jobs_table = dynamodb.Table(os.environ["JOBS_TABLE"])
customers_table = dynamodb.Table(os.environ["CUSTOMERS_TABLE"])


def lambda_handler(event, context):
    """
    API entry point for:
      - GET  /          (root)
      - GET  /hello     (health check)
      - GET  /jobs
      - POST /jobs
      - GET  /customers
      - POST /customers
    """
    logger.info("Event: %s", json.dumps(event))

    path = event.get("path", "")
    method = event.get("httpMethod", "")

    # Root endpoint - simple landing / status
    if path in ("", "/") and method == "GET":
        return response(200, {
            "message": "Field Service API - root",
            "endpoints": ["/hello", "/jobs", "/customers"],
        })

    # Simple health/check endpoint
    if path == "/hello" and method == "GET":
        return response(200, "Ryan's Lambda")

    # Customer endpoints (customer web UI / inbound call flow)
    if path == "/customers" and method == "POST":
        return create_customer(event)

    if path == "/customers" and method == "GET":
        return list_customers()

    # Jobs endpoints (internal / dispatcher or simple UI)
    if path == "/jobs" and method == "POST":
        return create_job(event)

    if path == "/jobs" and method == "GET":
        return list_jobs()

    # OPTIONS for CORS preflight
    if method == "OPTIONS":
        return response(200, "", extra_headers={})

    return response(404, {"message": "Not found"})


# ---------- CUSTOMERS ----------


def create_customer(event):
    """
    Create a new customer record from inbound web/call data.

    Expected JSON body (all optional except full_name + phone):
    {
      "full_name": "...",
      "phone": "...",
      "email": "...",
      "address_line1": "...",
      "address_line2": "...",
      "city": "...",
      "state": "...",
      "postal_code": "...",
      "country": "...",
      "is_business": true/false,
      "company_name": "...",
      "notes": "..."
    }
    """
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"message": "Invalid JSON body"})

    full_name = body.get("full_name")
    phone = (body.get("phone") or "").strip()

    if not full_name:
        return response(400, {"message": "full_name is required"})
    if not phone:
        return response(400, {"message": "phone is required"})

    now = now_utc_iso()
    customer_id = str(uuid.uuid4())

    is_business_raw = body.get("is_business")
    if isinstance(is_business_raw, bool):
        is_business = is_business_raw
    elif isinstance(is_business_raw, str):
        is_business = is_business_raw.lower() in ("true", "1", "yes", "y")
    else:
        is_business = False

    item = {
        "id": customer_id,
        "organization_id": ORGANIZATION_ID,
        "full_name": full_name,
        "phone": phone,
        "email": body.get("email"),
        "address_line1": body.get("address_line1") or address,
        "address_line2": body.get("address_line2"),
        "is_business": is_business,
        "company_name": body.get("company_name"),
        "notes": body.get("notes") or "",
        "created_at": now,
        "updated_at": now,
    }


    customers_table.put_item(Item=item)

    return response(201, item)


def list_customers():
    """For MVP this is a plain scan; later we can paginate or filter."""
    resp = customers_table.scan(
        FilterExpression=Attr("organization_id").eq(ORGANIZATION_ID)
    )
    items = resp.get("Items", [])
    return response(200, items)


def get_or_create_customer(full_name: str, phone: str, address: str | None = None):
    """
    Look up a customer by phone + organization.
    If found, return that customer.
    If not, create a new minimal customer record.

    If address is provided and this is a new customer, store it
    in address_line1. We leave city/state/etc as None for now.
    """
    phone_norm = (phone or "").strip()

    # Small-scale MVP: use a scan. Later, add a GSI on phone.
    resp = customers_table.scan(
        FilterExpression=Attr("organization_id").eq(ORGANIZATION_ID)
                          & Attr("phone").eq(phone_norm)
    )
    items = resp.get("Items", [])

    if items:
        customer = items[0]
        return customer

    # Not found -> create new minimal customer
    now = now_utc_iso()
    customer_id = str(uuid.uuid4())

    customer = {
        "id": customer_id,
        "organization_id": ORGANIZATION_ID,
        "full_name": full_name,
        "phone": phone_norm,
        "email": None,
        "address_line1": address,   # simplified
        "address_line2": None,
        "is_business": False,
        "company_name": None,
        "notes": "",
        "created_at": now,
        "updated_at": now,
    }

    customers_table.put_item(Item=customer)
    return customer




# ---------- JOBS ----------


def create_job(event):
    """
    Create a job from minimal UI data.

    Expected JSON body from frontend:
    {
      "customerName": "...",
      "customerPhone": "...",
      "address": "...",          # optional
      "description": "...",
      "priority": "normal"
    }
    """
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"message": "Invalid JSON body"})

    customer_name = body.get("customerName") or body.get("full_name")
    customer_phone = body.get("customerPhone") or body.get("phone")
    description = body.get("description") or body.get("problem") or ""
    address = body.get("address")
    priority = body.get("priority", "normal")

    if not customer_name:
        return response(400, {"message": "customerName/full_name is required"})
    if not customer_phone:
        return response(400, {"message": "customerPhone/phone is required"})

    # Find or create the customer by phone, passing address so we can store it
    customer = get_or_create_customer(customer_name, customer_phone, address)
    customer_id = customer["id"]

    now = now_utc_iso()
    job_id = str(uuid.uuid4())

    item = {
        "jobId": job_id,
        "organization_id": ORGANIZATION_ID,
        "customer_id": customer_id,
        "customerName": customer_name,
        "customerPhone": customer_phone,
        "address": address,
        "description": description,
        "status": "new",
        "priority": priority,
        "created_at": now,
        "updated_at": now,
    }

    jobs_table.put_item(Item=item)
    return response(201, item)

def now_utc_iso():
    return datetime.now(timezone.utc).isoformat()


def list_jobs():
    resp = jobs_table.scan(
        FilterExpression=Attr("organization_id").eq(ORGANIZATION_ID)
    )
    items = resp.get("Items", [])
    return response(200, items)


# ---------- RESPONSE HELPER ----------


def response(status_code, body, extra_headers=None):
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    }
    if extra_headers:
        headers.update(extra_headers)

    if isinstance(body, (dict, list)):
        body_str = json.dumps(body)
    else:
        body_str = str(body)

    return {
        "statusCode": status_code,
        "headers": headers,
        "body": body_str,
    }
