import json
import os
import uuid
import logging
from datetime import datetime

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")

# Existing jobs table
jobs_table = dynamodb.Table(os.environ["JOBS_TABLE"])

# New customers table (must be set in your Lambda env vars via SAM)
customers_table = dynamodb.Table(os.environ["CUSTOMERS_TABLE"])


def lambda_handler(event, context):
    """
    API entry point for:
      - GET  /hello
      - GET  /jobs
      - POST /jobs
      - GET  /customers
      - POST /customers
    """
    logger.info("Event: %s", json.dumps(event))

    path = event.get("path", "")
    method = event.get("httpMethod", "")

    # Simple health/check endpoint
    if path == "/hello" and method == "GET":
        return response(200, "Ryan's Lambda")

    # Customer endpoints (customer web UI / inbound call flow)
    if path == "/customers" and method == "POST":
        return create_customer(event)

    if path == "/customers" and method == "GET":
        return list_customers()

    # Jobs endpoints (internal / dispatcher for now)
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

    Expected JSON body:
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
    phone = body.get("phone")

    if not full_name:
        return response(400, {"message": "full_name is required"})
    if not phone:
        return response(400, {"message": "phone is required"})

    now = datetime.utcnow().isoformat() + "Z"
    customer_id = str(uuid.uuid4())

    # Normalize booleans safely
    is_business_raw = body.get("is_business")
    if isinstance(is_business_raw, bool):
        is_business = is_business_raw
    elif isinstance(is_business_raw, str):
        is_business = is_business_raw.lower() in ("true", "1", "yes", "y")
    else:
        is_business = False

    item = {
        "id": customer_id,
        "full_name": full_name,
        "phone": phone,
        "email": body.get("email"),
        "address_line1": body.get("address_line1"),
        "address_line2": body.get("address_line2"),
        "city": body.get("city"),
        "state": body.get("state"),
        "postal_code": body.get("postal_code"),
        "country": body.get("country"),
        "is_business": is_business,
        "company_name": body.get("company_name"),
        "notes": body.get("notes") or "",
        "created_at": now,
        "updated_at": now,
    }

    customers_table.put_item(Item=item)

    return response(201, item)


def list_customers():
    """
    Simple list of customers. For MVP this is a plain scan.
    You can add pagination / filters later.
    """
    resp = customers_table.scan()
    items = resp.get("Items", [])
    return response(200, items)


# ---------- JOBS (existing behavior kept for now) ----------


def create_job(event):
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"message": "Invalid JSON body"})

    job_id = str(uuid.uuid4())
    item = {
        "jobId": job_id,
        "customerName": body.get("customerName"),
        "customerPhone": body.get("customerPhone"),
        "address": body.get("address"),
        "description": body.get("description"),
        "priority": body.get("priority", "normal"),
    }

    # Basic validation
    if not item["customerName"]:
        return response(400, {"message": "customerName is required"})

    jobs_table.put_item(Item=item)

    return response(201, item)


def list_jobs():
    resp = jobs_table.scan()
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
