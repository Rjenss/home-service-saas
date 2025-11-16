def lambda_handler(event, context):
    return {
        "statusCode": 200,
        "body": "Hello from my first AWS Lambda deployed via GitHub Actions"
    }
