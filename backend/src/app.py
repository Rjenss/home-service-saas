import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    logger.info("Lambda invoked with event: %s", event)
    return {
        "statusCode": 200,
        "body": "Hello from my first AWS Lambda deployed via GitHub Actions"
    }
