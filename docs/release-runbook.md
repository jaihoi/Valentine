# Release Runbook

## Objective
Ship a single big-bang production release with deterministic gates and rollback control.

## Deployment Sequence
1. Select approved release ref (tag `v*` or pinned commit).
2. Trigger `.github/workflows/release.yml`.
3. Wait for `verify` job completion:
1. `npm run lint`
2. `npm run test`
3. `npm run test:e2e`
4. `npm run build`
4. Allow `deploy-production` only after green verification.
5. Confirm Vercel production deployment URL and version metadata.

## Real-Time Dashboard Checks
Perform checks at T+0, T+15m, T+30m, T+60m, T+120m.

1. API readiness:
1. `GET /api/health/live`
2. `GET /api/health/ready`
2. Error telemetry:
1. Sentry error count and top stack traces.
2. Provider-specific failure codes.
3. Product telemetry:
1. Flow start/complete counts for Flows 1–5.
2. Mutation failure spikes by route/code.
4. Infrastructure telemetry:
1. PostgreSQL connection health.
2. Redis memory, connection count, eviction metric.

## Rollback Criteria
Trigger rollback if any of the following holds:
1. Readiness endpoint remains `not_ready` for more than 5 minutes.
2. Critical endpoint error rate exceeds agreed threshold.
3. Provider timeout/failure spike causes widespread flow completion failure.
4. Authentication/session regression blocks normal user journey.

## Rollback Procedure
1. Mark incident in on-call channel with incident ID.
2. Roll back Vercel production alias to last known good deployment.
3. Confirm health endpoints on rolled back deployment.
4. Validate one happy path from Flow 1 and Flow 5.
5. Capture failure window, request IDs, and root cause notes.

## Webhook Secret Rotation Procedure
Apply for both `VAPI_WEBHOOK_SECRET` and `CLOUDINARY_WEBHOOK_SECRET`.

1. Generate new secret in provider dashboard.
2. Add new secret to staging env and deploy.
3. Send signed webhook test payload and confirm acceptance.
4. Promote secret to production env.
5. Re-run signed webhook test payload in production.
6. Revoke old provider secret after successful validation.
7. Record rotation date and owner in operations log.

## Backup and Restore Runbook

### PostgreSQL
1. Daily automated backups with point-in-time recovery enabled.
2. Keep at least 14 days retention in production.
3. Monthly restore drill into staging snapshot target.
4. Validate core entities after restore:
1. `User`
2. `PartnerProfile`
3. `DatePlan`
4. `GiftRecommendation`
5. `GeneratedContent`
6. `VoiceSession`

### Redis
1. Use managed Redis with persistence enabled for your chosen tier.
2. Enforce `noeviction` policy.
3. Treat Redis data as ephemeral cache/queue state; app must recover from transient loss.
4. Validate worker and rate-limit behavior after Redis restart drill.
