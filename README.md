# SENG 533 Group 15 Project

## Project Topic
Performance evaluation of an AWS Lambda based serverless web application.

## System Under Study
- AWS Lambda
- API Gateway
- CloudWatch

## Out of Scope
- No database
- No external storage
- No microservices
- No LLM hosting

## Experimental Factors
- Request arrival rate: 5, 10, 20, 50, 100, 200 requests/s
- Reserved concurrency: 10, 50, 100, 300
- Memory allocation: 128 MB, 512 MB, 1024 MB
- Workload pattern: sustained and burst

## Metrics
- Response time
- Throughput
- Error rate
- Concurrency
- Cold start latency