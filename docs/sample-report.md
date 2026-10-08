# Sherlog: checkout-pool

Leading hypothesis: Database connection pool exhaustion. Independent signals agree; verify with the service owner before remediation.

- Status: diagnosed
- Cause: db_pool_exhaustion
- Evidence support: corroborated
- Mode: offline
- Tool calls: 4

## Evidence

- [L1] database connection acquisition timed out
- [M:db_pool_utilization_pct] db_pool_utilization_pct: 35 -> 99
- [R1] Database connection pool exhaustion

## Suggested Next Steps

1. Inspect slow queries and leaked connections before changing pool limits.
2. Compare active connections with database capacity; involve the database owner.
3. After an approved mitigation, verify pool utilization and checkout error rate recover.

## Tool Trace

1. search_logs | ok | 0.04 ms | Collect search logs to corroborate the alert.
2. inspect_metrics | ok | 0.0 ms | Collect inspect metrics to corroborate the alert.
3. deployment_history | ok | 0.01 ms | Collect deployment history to corroborate the alert.
4. search_runbooks | ok | 0.22 ms | Collect search runbooks to corroborate the alert.

Synthetic snapshot; support strength is not a calibrated probability. Suggested actions require review; Sherlog makes no production changes.

