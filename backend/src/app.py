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

# One org per deployment or stack
ORGANIZATION_ID = os.environ.get("ORGANIZATION_ID", "org_pilot")

jobs_table = dynamodb.Table(os.environ["JOBS_TABLE"])
customers_table = dynamodb.Table(os.environ["CUSTOMERS_TABLE"])
technicians_table = dynamodb.Table(os.environ["TECHNICIANS_TABLE"])
job_visits_table = dynamodb.Table(os.environ["JOB_VISITS_TABLE"])


def lambda_handler(event, context):
    """
    API entry point for:
      GET  /
      GET  /hello

      GET  /jobs
      POST /jobs

      GET  /customers
      POST /customers

      GET  /technicians
      POST /technicians

      GET  /job_visits
      POST /job_visits

    Notes:
      - Multi tenant foundation via organization_id
      - CORS enabled for browser calls
    """
    logger.info("Event: %s", json.dumps(event))

    path = event.get("path", "")
    method = event.get("httpMethod", "")

    # CORS preflight
    if method == "OPTIONS":
        return response(200, "", extra_headers={})

    # Root endpoint
    if path in ("", "/") and method == "GET":
        return response(
            200,
            {
                "message": "Field Service API",
                "organization_id": ORGANIZATION_ID,
                "endpoints": [
                    "/hello",
                    "/jobs",
                    "/customers",
                    "/technicians",
                    "/job_visits",
                ],
            },
        )

    # Health check
    if path == "/hello" and method == "GET":
        return response(200, {"message": "ok"})

    # Customers
    if path == "/customers" and method == "POST":
        return create_customer(event)
    if path == "/customers" and method == "GET":
        return list_customers()

    # Jobs
    if path == "/jobs" and method == "POST":
        return create_job(event)
    if path == "/jobs" and method == "GET":
        return list_jobs()

    # Technicians
    if path == "/technicians" and method == "POST":
        return create_technician(event)
    if path == "/technicians" and method == "GET":
        return list_technicians()

    # Job visits
    if path == "/job_visits" and method == "POST":
        return create_job_visit(event)
    if path == "/job_visits" and method == "GET":
        return list_job_visits()

    return response(404, {"message": "Not found"})


# ---------- TIME HELPERS ----------


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- GENERAL HELPERS ----------


def safe_json_body(event):
    try:
        return json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return None


def parse_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        v = value.strip().lower()
        if v in ("true", "1", "yes", "y"):
            return True
        if v in ("false", "0", "no", "n"):
            return False
    return default


def normalize_phone(phone: str) -> str:
    if phone is None:
        return ""
    phone = phone.strip()
    digits = "".join([c for c in phone if c.isdigit()])
    return digits or phone


# ---------- CUSTOMERS ----------


def create_customer(event):
    """
    Create a new customer record.

    Expected JSON body:
    {
      "full_name": "...",
      "phone": "...",
      "email": "...",
      "address_line1": "...",
      "address_line2": "...",
      "is_business": true or false,
      "company_name": "...",
      "notes": "..."
    }
    """
    body = safe_json_body(event)
    if body is None:
        return response(400, {"message": "Invalid JSON body"})

    full_name = (body.get("full_name") or "").strip()
    phone = normalize_phone(body.get("phone") or "")

    if not full_name:
        return response(400, {"message": "full_name is required"})
    if not phone:
        return response(400, {"message": "phone is required"})

    now = now_utc_iso()
    customer_id = str(uuid.uuid4())

    item = {
        "id": customer_id,
        "organization_id": ORGANIZATION_ID,
        "full_name": full_name,
        "phone": phone,
        "email": body.get("email"),
        "address_line1": body.get("address_line1"),
        "address_line2": body.get("address_line2"),
        "is_business": parse_bool(body.get("is_business"), default=False),
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
    return response(200, resp.get("Items", []))


def get_or_create_customer(full_name: str, phone: str, address: str | None = None):
    """
    Look up a customer by normalized phone and organization.
    If found, return it.
    If not, create a new minimal customer.

    If address is provided and this is a new customer, store it in address_line1.
    """
    phone_norm = normalize_phone(phone)

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
        "full_name": (full_name or "").strip(),
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
    Create a job from UI data.

    Expected JSON body:
    {
      "customerName": "...",
      "customerPhone": "...",
      "address": "...",
      "description": "...",
      "priority": "normal",
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "status": "Scheduled"  (optional override)
    }

    Status derivation:
      - If status is provided, we use it
      - If status is missing, status becomes Scheduled when date and time are present, else Unscheduled

    Job visit creation:
      - If final status is Scheduled and date and time exist, create an initial Job Visit record
    """
    body = safe_json_body(event)
    if body is None:
        return response(400, {"message": "Invalid JSON body"})

    customer_name = (body.get("customerName") or body.get("full_name") or "").strip()
    customer_phone = normalize_phone(body.get("customerPhone") or body.get("phone") or "")
    description = body.get("description") or body.get("problem") or ""
    address = body.get("address")
    priority = body.get("priority", "normal")

    date_str = body.get("date")
    time_str = body.get("time")

    if not customer_name:
        return response(400, {"message": "customerName is required"})
    if not customer_phone:
        return response(400, {"message": "customerPhone is required"})

    customer = get_or_create_customer(customer_name, customer_phone, address)
    customer_id = customer["id"]

    now = now_utc_iso()
    job_id = str(uuid.uuid4())

    incoming_status = body.get("status")
    if isinstance(incoming_status, str) and incoming_status.strip():
        job_status = incoming_status.strip()
    else:
        job_status = "Scheduled" if (date_str and time_str) else "Unscheduled"

    job_item = {
        "jobId": job_id,
        "organization_id": ORGANIZATION_ID,
        "customer_id": customer_id,
        "customerName": customer_name,
        "customerPhone": customer_phone,
        "address": address,
        "description": description,
        "status": job_status,
        "priority": priority,
        "requested_date": date_str,
        "requested_time": time_str,
        "created_at": now,
        "updated_at": now,
    }

    jobs_table.put_item(Item=job_item)

    if job_status == "Scheduled" and date_str and time_str:
        create_initial_job_visit_for_job(
            job_id=job_id,
            date_str=date_str,
            time_str=time_str,
            notes=description,
        )

    # Return flat job item so frontend can read createdJob.jobId
    return response(201, job_item)


def list_jobs():
    resp = jobs_table.scan(
        FilterExpression=Attr("organization_id").eq(ORGANIZATION_ID)
    )
    return response(200, resp.get("Items", []))


# ---------- JOB VISITS ----------


def create_initial_job_visit_for_job(
    job_id: str,
    date_str: str | None,
    time_str: str | None,
    notes: str | None = "",
):
    """
    Create a single initial visit when the job is created.
    technician_id is None initially.
    """
    now = now_utc_iso()
    visit_id = str(uuid.uuid4())

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
        "technician_id": None,
        "scheduled_date": date_str,
        "scheduled_time": time_str,
        "scheduled_display": scheduled_display,
        "actual_start": None,
        "actual_end": None,
        "status": "scheduled",
        "notes": notes or "",
        "created_at": now,
        "updated_at": now,
    }

    job_visits_table.put_item(Item=item)
    return item


def create_job_visit(event):
    """
    Create a job visit record directly.

    Expected JSON body:
    {
      "job_id": "...",
      "technician_id": "...",          optional
      "scheduled_date": "YYYY-MM-DD",  optional
      "scheduled_time": "HH:MM",       optional
      "scheduled_start": "...",        optional
      "scheduled_end": "...",          optional
      "status": "scheduled",
      "notes": "..."
    }

    Note:
      - Your current calendar uses scheduled_date and scheduled_time
      - scheduled_start and scheduled_end are accepted for future upgrade
    """
    body = safe_json_body(event)
    if body is None:
        return response(400, {"message": "Invalid JSON body"})

    job_id = body.get("job_id") or body.get("jobId")
    if not job_id:
        return response(400, {"message": "job_id is required"})

    now = now_utc_iso()
    visit_id = str(uuid.uuid4())

    scheduled_date = body.get("scheduled_date") or body.get("date")
    scheduled_time = body.get("scheduled_time") or body.get("time")

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
        "technician_id": body.get("technician_id"),
        "scheduled_date": scheduled_date,
        "scheduled_time": scheduled_time,
        "scheduled_display": scheduled_display,
        "scheduled_start": body.get("scheduled_start"),
        "scheduled_end": body.get("scheduled_end"),
        "actual_start": body.get("actual_start"),
        "actual_end": body.get("actual_end"),
        "status": body.get("status") or "scheduled",
        "notes": body.get("notes") or "",
        "created_at": now,
        "updated_at": now,
    }

    job_visits_table.put_item(Item=item)
    return response(201, item)


def list_job_visits():
    resp = job_visits_table.scan(
        FilterExpression=Attr("organization_id").eq(ORGANIZATION_ID)
    )
    return response(200, resp.get("Items", []))


# ---------- TECHNICIANS ----------


def create_technician(event):
    """
    Create a technician record.

    Expected JSON body:
    {
      "first_name": "...",
      "last_name": "...",
      "phone": "...",
      "email": "...",
      "skill_tags": "PANEL_UPGRADE,EV_CHARGER",
      "active": true or false
    }
    """
    body = safe_json_body(event)
    if body is None:
        return response(400, {"message": "Invalid JSON body"})

    first_name = (body.get("first_name") or "").strip()
    last_name = (body.get("last_name") or "").strip()
    phone = normalize_phone(body.get("phone") or "")

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
        "active": parse_bool(body.get("active"), default=True),
        "created_at": now,
        "updated_at": now,
    }

    technicians_table.put_item(Item=item)
    return response(201, item)


def list_technicians():
    resp = technicians_table.scan(
        FilterExpression=Attr("organization_id").eq(ORGANIZATION_ID)
    )
    return response(200, resp.get("Items", []))


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
