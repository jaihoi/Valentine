# Environment Matrix

## Target Topology
Valentine is deployed as two Vercel environments with isolated data stores.

1. `staging`
2. `production`

Each environment must use:
1. Dedicated managed PostgreSQL database.
2. Dedicated managed Redis instance.
3. Dedicated API keys and webhook secrets.

## Required Variables by Environment
Set all values in Vercel project settings for each environment.

### Core Runtime
1. `NODE_ENV`
2. `DATABASE_URL`
3. `JWT_SECRET`
4. `APP_BASE_URL`

### Feature Flags
1. `NEXT_PUBLIC_FLOW1_ONLY`
2. `NEXT_PUBLIC_FLOW2_ENABLED`
3. `NEXT_PUBLIC_FLOW3_ENABLED`
4. `NEXT_PUBLIC_FLOW4_ENABLED`
5. `NEXT_PUBLIC_FLOW5_ENABLED`

### Provider Keys
1. `FASTROUTER_API_KEY`
2. `FASTROUTER_API_URL`
3. `FASTROUTER_MODEL`
4. `OPENAI_API_KEY`
5. `PERPLEXITY_API_KEY`
6. `FIRECRAWL_API_KEY`
7. `DEEPGRAM_API_KEY`
8. `VAPI_API_KEY`
9. `ELEVENLABS_API_KEY`
10. `ELEVENLABS_VOICE_ID`
11. `CLOUDINARY_CLOUD_NAME`
12. `CLOUDINARY_API_KEY`
13. `CLOUDINARY_API_SECRET`

### Reliability and Telemetry
1. `REDIS_URL`
2. `POSTHOG_API_KEY`
3. `POSTHOG_HOST`
4. `SENTRY_DSN`
5. `SENTRY_RELEASE`

### Webhook Secrets
1. `VAPI_WEBHOOK_SECRET`
2. `CLOUDINARY_WEBHOOK_SECRET`

### Production Safety
1. `ENFORCE_PROD_ENV_VALIDATION=true`

## Branch Protection Requirements
Enable branch protection on `main` with required status checks:
1. `CI / verify`
2. `E2E / playwright`

Disallow direct pushes to `main`.
