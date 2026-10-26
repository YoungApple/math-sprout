# 题芽 MathSprout — AI 小学数学错题本

Photograph a wrong answer → Gemini diagnoses the root cause → Socratic hints → 3 graded
variant questions (L1 numbers / L2 context / L3 reverse) → Ebbinghaus review queue.

## Stack

- Next.js 15 (App Router, React 19, TypeScript), Tailwind CSS, KaTeX, PWA manifest
- `@google/genai` with Structured Outputs (`responseSchema`) — one multimodal call per mistake
- libSQL (`@libsql/client`): SQLite file in dev, Turso in prod; same SQL
- Images: local disk in dev, GCS in prod; always served via /api/images on our own host
- Cloud Run (asia-east1) fronted by a free Cloudflare Worker reverse proxy on your domain

## Local development

```bash
cp .env.example .env.local      # fill GEMINI_API_KEY
npm install
npm run dev                     # http://localhost:3000
```

Phone camera testing requires HTTPS (except `localhost`). Easiest options: Chrome DevTools
device emulation + a photo file, or `npx localtunnel --port 3000` to get a temporary HTTPS URL.

## Project layout

```
src/app/
  page.tsx                  Today: due-for-review queue (max 3) + capture CTA
  capture/page.tsx          Camera capture, client-side downscale, upload
  mistakes/page.tsx         Library + weak-topic Top 5
  mistakes/[id]/page.tsx    Stem / diagnosis / SVG / hints / variant quiz
  api/mistakes              POST (upload + diagnose) / GET (list)
  api/mistakes/[id]/attempt POST graded answer → state machine
  api/images/[...path]      Serves photos (local disk or GCS) via our own host
src/lib/
  gemini.ts     Prompt + JSON schema + sanitizer
  review.ts     Ebbinghaus intervals, state machine, lenient answer check
  repo.ts       Data access (mistakes / variants / attempts)
  db.ts         libSQL client + idempotent schema
  storage.ts    Local FS / GCS abstraction
  auth.ts       Optional family passcode gate
deploy/
  env.sh                        PROJECT_ID / REGION / DOMAIN / BUCKET
  01-setup-gcp.sh               APIs, bucket, secrets, service account (run once)
  02-deploy.sh                  Cloud Build + Cloud Run deploy (run per release)
  03-domain-cloudflare.sh       Free Cloudflare Worker proxy on your domain (run once)
  cloudflare-proxy/             worker.js + wrangler.toml used by step 03
  04-optional-static-ip-lb.sh   Paid fallback: GCP LB + static IP + managed cert
```

## Deploy (free tier, reachable from mainland China)

Everything below fits in free tiers: Cloud Run, Cloudflare Free + Workers, Turso, GCS
Always-Free (us-west1), Secret Manager, Artifact Registry, Gemini API free tier.
The only thing worth paying for is Gemini pay-as-you-go (~$0.3-1/month) so homework
photos are not used for model improvement.

Why this shape: `*.run.app`, `ghs.googlehosted.com` and `storage.googleapis.com` are
blocked in mainland China, but Cloudflare's edge and the Cloud Run service itself are
reachable. So a free Cloudflare Worker reverse-proxies `math.<your-domain>` to the
`*.run.app` origin, and photos are always served through `/api/images/...` on our own host.

```bash
# 0. Move your domain's nameservers to Cloudflare (Free plan). CNAME-only setup is paid.
#    In Cloudflare DNS add a proxied placeholder:  AAAA  math  100::   (orange cloud)
#    SSL/TLS mode: Full.
# 1. edit deploy/env.sh (PROJECT_ID, DOMAIN)
./deploy/01-setup-gcp.sh          # APIs, bucket, secrets, service account (run once)
./deploy/02-deploy.sh             # Cloud Build + Cloud Run, prints https://...run.app
./deploy/03-domain-cloudflare.sh  # publishes the Worker + route math.<your-domain>/*
# Optional paid upgrade if Cloudflare is flaky from your ISP (~$18/mo, static Taiwan IP):
./deploy/04-optional-static-ip-lb.sh
```

Database options for the `database-url` secret:

- **Turso (recommended, free tier)**: `turso db create math-sprout --location hkg`, then
  `turso db show math-sprout --url` and `turso db tokens create math-sprout`.
- Leave the secret unset to fall back to an ephemeral SQLite file inside the container
  (fine for smoke-testing, data is lost on redeploy).

Check mainland reachability after DNS propagates with a multi-province HTTP probe such as
ping.chinaz.com or boce.com.

## Mastery state machine

```
PENDING ──L1 correct──▶ CONSOLIDATING ──L2 & L3 correct──▶ MASTERED
   ▲                        │ any wrong                        │ wrong on scheduled review
   └────────────────────────┘                                  ▼
   ◀─────────────────────────────────────────────────────── RELAPSED
```

Intervals after each successful round: 1, 2, 4, 7, 15, 30 days.

## Roadmap

- [ ] Whole-page capture with Gemini bounding boxes → multiple mistakes per photo
- [ ] Clean-stem rendering (handwriting removed) for printable worksheets
- [ ] Deterministic re-verification of variant answers (math.js) before saving
- [ ] Parent dashboard: radar chart by error category, weekly PDF export
- [ ] Photo grading of handwritten variant answers
