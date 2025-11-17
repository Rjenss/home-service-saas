import json
import os
import uuid
import logging

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
jobs_table = dynamodb.Table(os.environ["JOBS_TABLE"])


def lambda_handler(event, context):
    """
    API entry point for:
      - GET /hello
      - GET /jobs
      - POST /jobs
    """
    logger.info("Event: %s", json.dumps(event))

    path = event.get("path", "")
    method = event.get("httpMethod", "")

    # Simple health/check endpoint
    if path == "/hello" and method == "GET":
        return response(200, "Hello from my first AWS Lambda deployed via GitHub Actions")

    # Jobs endpoints
    if path == "/jobs" and method == "POST":
        return create_job(event)

    if path == "/jobs" and method == "GET":
        return list_jobs()

    # OPTIONS for CORS preflight
    if method == "OPTIONS":
        return response(200, "", extra_headers={})

    return response(404, {"message": "Not found"})


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
