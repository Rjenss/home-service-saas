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
technicians_table = dynamodb.Table(os.environ["TECHNICIANS_TABLE"])
job_visits_table = dynamodb.Table(os.environ["JOB_VISITS_TABLE"])


def lambda_handler(event, context):
    """
    API entry point for:
      - GET  /              (root)
      - GET  /hello         (health check)
      - GET  /jobs
      - POST /jobs
      - GET  /customers
      - POST /customers
      - GET  /technicians
      - POST /technicians
      - GET  /job_visits
      - POST /job_visits
    """
    logger.info("Event: %s", json.dumps(event))

    path = event.get("path", "")
    method = event.get("httpMethod", "")

    # Root endpoint - simple landing / status
    if path in ("", "/") and method == "GET":
        return response(200, {
            "message": "Field Service API - root",
            "endpoints": [
                "/hello",
                "/jobs",
                "/customers",
                "/technicians",
                "/job_visits",
            ],
        })

    # Simple health/check endpoint
    if path == "/hello" and method == "GET":
        return response(200, "Ryan's Lambda")

    # Customer endpoints
    if path == "/customers" and method == "POST":
        return create_customer(event)
    if path == "/customers" and method == "GET":
        return list_customers()

    # Job endpoints
    if path == "/jobs" and method == "POST":
        return create_job(event)
    if path == "/jobs" and method == "GET":
        return list_jobs()

    # Technician endpoints (internal admin UI)
    if path == "/technicians" and method == "POST":
        return create_technician(event)
    if path == "/technicians" and method == "GET":
        return list_technicians()

    # Job visit endpoints (calendar will use these)
    if path == "/job_visits" and method == "POST":
        return create_job_visit(event)
    if path == "/job_visits" and method == "GET":
        return list_job_visits()

    # OPTIONS for CORS preflight
    if method == "OPTIONS":
        return response(200, "", extra_headers={})

    return response(404, {"message": "Not found"})


# ---------- TIME HELPERS ----------


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
        "address_line1": body.get("address_line1"),
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
    in address_line1.
    """
    phone_norm = (phone or "").strip()

    resp = customers_table.scan(
        FilterExpression=Attr("organization_id").eq(ORGANIZATION_ID)
        & Attr("phone").eq(phone_norm)
    )
    items = resp.get("Items", [])

    if items:
        return items[0]

    now = now_utc_iso()
    customer_id = str(uuid.uuid4())

    customer = {
        "id": customer_id,
        "organization_id": ORGANIZATION_ID,
        "full_name": full_name,
        "phone": phone_norm,
        "email": None,
        "address_line1": address,
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
      "priority": "normal",
      "date": "2025-11-24",      # requested date (string)
      "time": "14:30"            # requested time (string, 24h)
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
    date_str = body.get("date")   # keep as simple string for now
    time_str = body.get("time")   # keep as simple string for now

    if not customer_name:
        return response(400, {"message": "customerName/full_name is required"})
    if not customer_phone:
        return response(400, {"message": "customerPhone/phone is required"})

    # Find or create the customer by phone, passing address so we can store it
    customer = get_or_create_customer(customer_name, customer_phone, address)
    customer_id = customer["id"]

    now = now_utc_iso()
    job_id = str(uuid.uuid4())

    job_item = {
        "jobId": job_id,
        "organization_id": ORGANIZATION_ID,
        "customer_id": customer_id,
        "customerName": customer_name,
        "customerPhone": customer_phone,
        "address": address,
        "description": description,
        "status": "new",
        "priority": priority,
        "requested_date": date_str,
        "requested_time": time_str,
        "created_at": now,
        "updated_at": now,
    }

    jobs_table.put_item(Item=job_item)

    # Also create an initial Job Visit (no technician assigned yet)
    visit_item = create_initial_job_visit_for_job(
        job_id=job_id,
        date_str=date_str,
        time_str=time_str,
        notes=description,
    )

    # Return both job and visit so the UI has everything if needed
    return response(201, {"job": job_item, "job_visit": visit_item})


def list_jobs():
    resp = jobs_table.scan(
        FilterExpression=Attr("organization_id").eq(ORGANIZATION_ID)
    )
    items = resp.get("Items", [])
    return response(200, items)


# ---------- JOB VISITS ----------


def create_initial_job_visit_for_job(
    job_id: str,
    date_str: str | None,
    time_str: str | None,
    notes: str | None = "",
):
    """
    Helper to create a single initial visit when the job is created.
    For now, technician_id is None (unassigned), and we just store
    date/time as provided plus a simple combined string.
    """
    now = now_utc_iso()
    visit_id = str(uuid.uuid4())

    # Simple combined string for display; you can improve later
    if date_str and time_str:
        scheduled_display = f"{date_str} {time_str}"
    elif date_str:
        scheduled_display = date_str
    else:
        scheduled_display = None

    item = {
        "id": visit_id,
        "organization_id": ORGANIZATION_ID,
        "job_id": job_id,
        "technician_id": None,          # assign later from calendar
        "scheduled_date": date_str,
        "scheduled_time": time_str,
        "scheduled_display": scheduled_display,
        "status": "scheduled",
        "notes": notes or "",
        "created_at": now,
        "updated_at": now,
    }

    job_visits_table.put_item(Item=item)
    return item


def create_job_visit(event):
    """
    Direct endpoint for creating a job visit (will be used by calendar UI).

    Expected JSON:
    {
      "job_id": "...",
      "technician_id": "...",    # optional for now
      "scheduled_date": "2025-11-24",
      "scheduled_time": "14:30",
      "status": "scheduled",
      "notes": "..."
    }
    """
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"message": "Invalid JSON body"})

    job_id = body.get("job_id")
    technician_id = body.get("technician_id")
    scheduled_date = body.get("scheduled_date")
    scheduled_time = body.get("scheduled_time")
    status = body.get("status", "scheduled")
    notes = body.get("notes") or ""

    if not job_id:
        return response(400, {"message": "job_id is required"})

    now = now_utc_iso()
    visit_id = str(uuid.uuid4())

    if scheduled_date and scheduled_time:
        scheduled_display = f"{scheduled_date} {scheduled_time}"
    elif scheduled_date:
        scheduled_display = scheduled_date
    else:
        scheduled_display = None

    item = {
        "id": visit_id,
        "organization_id": ORGANIZATION_ID,
        "job_id": job_id,
        "technician_id": technician_id,
        "scheduled_date": scheduled_date,
        "scheduled_time": scheduled_time,
        "scheduled_display": scheduled_display,
        "status": status,
        "notes": notes,
        "created_at": now,
        "updated_at": now,
    }

    job_visits_table.put_item(Item=item)
    return response(201, item)


def list_job_visits():
    resp = job_visits_table.scan(
        FilterExpression=Attr("organization_id").eq(ORGANIZATION_ID)
    )
    items = resp.get("Items", [])
    return response(200, items)


# ---------- TECHNICIANS ----------


def create_technician(event):
    """
    Create a technician record.

    Expected JSON:
    {
      "first_name": "...",
      "last_name": "...",
      "phone": "...",
      "email": "...",
      "skill_tags": "PANEL_UPGRADE,EV_CHARGER"
    }
    """
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"message": "Invalid JSON body"})

    first_name = (body.get("first_name") or "").strip()
    last_name = (body.get("last_name") or "").strip()
    phone = (body.get("phone") or "").strip()

    if not first_name:
        return response(400, {"message": "first_name is required"})
    if not phone:
        return response(400, {"message": "phone is required"})

    now = now_utc_iso()
    tech_id = str(uuid.uuid4())

    item = {
        "id": tech_id,
        "organization_id": ORGANIZATION_ID,
        "first_name": first_name,
        "last_name": last_name,
        "phone": phone,
        "email": body.get("email"),
        "skill_tags": body.get("skill_tags"),
        "active": True,
        "created_at": now,
        "updated_at": now,
    }

    technicians_table.put_item(Item=item)
    return response(201, item)


def list_technicians():
    resp = technicians_table.scan(
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
