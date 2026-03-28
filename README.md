# SENG 533 Group 15 Project

## Project Overview
This project focuses on the performance evaluation of an AWS Lambda-based serverless system under varying workload conditions. The goal is to understand how AWS Lambda behaves in terms of scalability, latency, and resource utilization when exposed to different traffic patterns.

We are specifically analyzing how system performance changes based on:
- Request load (arrival rate)
- Memory allocation
- Concurrency limits
- Workload type (sustained vs burst)

## System Under Study
The system is intentionally designed to be simple and controlled, so that results reflect infrastructure behavior rather than application complexity.

Components:
- AWS Lambda → Handles computation (JSON parsing + lightweight processing)
- API Gateway → Routes incoming HTTP requests to Lambda
- Amazon CloudWatch → Collects metrics (invocations, latency, concurrency, etc.)

## Out of Scope
To ensure valid performance measurements, we exclude:
- Databases (to avoid I/O variability)
- External storage (e.g., S3, DynamoDB)
- Microservices or distributed systems
- LLMs or heavy compute workloads

## Experimental Factors
- Request arrival rate: 5, 10, 20, 50, 100, 200 requests/s
- Reserved concurrency: 10, 50, 100, 300
- Memory allocation: 128 MB, 512 MB, 1024 MB
- Workload pattern: sustained and burst

## Metrics Collected
We record the following metrics for every run:

**From k6**
- Average latency (ms)
- P95 latency (ms)
- Max latency (ms)
- Throughput (requests completed)
- Error rate (%)

**From CloudWatch**
- Invocation count
- Average / max execution duration
- Concurrent executions
- Throttles
- Cold start observations (manual/derived)

## Metrics Collected
**Group A: Sustained Workload (Baseline)**
- Vary arrival rates (5 → 200 rps)
- Memory = 128 MB
- Unreserved concurrency

**Group B: Memory Scaling**
- Fixed workload (100 rps sustained)
- Memory:
    - 128 MB
    - 512 MB
    - 1024 MB

**Group C: Burst Workloads**
- Simulate traffic spikes
- Memory:
    - 128 MB (Run 9)
    - 512 MB (Run 10)
- Same duration (10 min), but variable request pattern

**Group D: Concurrency Limits (Final Phase)**
- Apply reserved concurrency:
    - 10, 50, 100, 300
- Compare against baseline (unreserved)