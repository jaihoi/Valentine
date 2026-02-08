# Launch Checklist (Big-Bang Release)

## Pre-Launch Gates
1. `CI` workflow is green on release ref.
2. `E2E` workflow is green on release ref.
3. `Release` verification job passes fully (`lint`, `test`, `test:e2e`, `build`).
4. Staging deployment uses release candidate commit.

## Staging Smoke Verification
1. Flow 1 happy path passes.
2. Flow 2 happy path passes.
3. Flow 3 happy path passes.
4. Flow 4 immediate-start path passes.
5. Flow 5 happy path passes.
6. `GET /api/health/live` returns `200`.
7. `GET /api/health/ready` returns `200` with all checks `ok`.

## Observability and Alerting
1. Sentry ingest receives test event from staging.
2. PostHog receives at least one flow event from staging.
3. Logs show `x-request-id` on API error events.
4. On-call channel receives test alert signal.

## Production Readiness
1. Production env vars match `docs/environment-matrix.md`.
2. `ENFORCE_PROD_ENV_VALIDATION=true` is set.
3. Managed DB backup policy confirmed.
4. Managed Redis eviction policy set to `noeviction`.
5. Webhook secrets rotated within last 90 days or rotation exception approved.

## Production Launch Steps
1. Trigger `Release` workflow from approved release ref/tag.
2. Confirm `deploy-production` job succeeds.
3. Verify production `GET /api/health/live` and `GET /api/health/ready`.
4. Run one production smoke check for each flow.

## Post-Launch Watch
1. Active monitoring for first 2 hours.
2. Track error rate, provider failure rate, and latency every 15 minutes.
3. Open incident and rollback immediately if error budget threshold is exceeded.
4. Perform 24-hour stability review and publish summary.
