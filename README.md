# 题芽 MathSprout — AI 小学数学错题本

Photograph a wrong answer → Gemini diagnoses the root cause → Socratic hints → 3 graded
variant questions (L1 numbers / L2 context / L3 reverse) → Ebbinghaus review queue.

## Stack

- Next.js 15 (App Router, React 19, TypeScript), Tailwind CSS, KaTeX, PWA manifest
- `@google/genai` with Structured Outputs (`responseSchema`) — one multimodal call per mistake
- libSQL (`@libsql/client`): SQLite file in dev, Turso in prod; same SQL
- Images: local disk in dev, GCS in prod; always served via /api/images on our own host
- Docker Compose + Caddy on a GCE VM (asia-east1); GHCR images via GitHub Actions

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
  auth.ts       Passcode check helper for API routes
src/middleware.ts Family passcode gate for all pages/APIs (redirects to /login)
deploy/
  vm/               docker-compose.yml, Caddyfile, install/update/backup scripts (primary)
  env.sh                        PROJECT_ID / REGION / DOMAIN / BUCKET
  01-setup-gcp.sh               APIs, bucket, secrets, service account (run once)
  02-deploy.sh                  Cloud Build + Cloud Run deploy (run per release)
  03-domain-cloudflare.sh       Free Cloudflare Worker proxy on your domain (run once)
  cloudflare-proxy/             worker.js + wrangler.toml used by step 03
  04-optional-static-ip-lb.sh   Paid fallback: GCP LB + static IP + managed cert
```

## Deploy

Primary target (see [ADR 0001](docs/adr/0001-hosting-and-china-reachability.md)): the owner's
GCE VM in asia-east1, served at **https://math.watchparty.cn** with Docker Compose + Caddy.
Images are built by GitHub Actions and published to GHCR; the VM pulls them.

```bash
# On the VM (once). Needs Docker Engine + compose plugin already installed.
curl -fsSL https://raw.githubusercontent.com/YoungApple/math-sprout/main/deploy/vm/install.sh \
  | DOMAIN=math.watchparty.cn bash
nano /opt/math-sprout/.env          # GEMINI_API_KEY, FAMILY_PASSCODE
cd /opt/math-sprout && docker compose up -d
# DNSPod: A record  math  ->  <VM public IP>
```

Continuous deploy: set repo variables `VM_HOST`, `VM_USER` and secret `VM_SSH_KEY`
(a dedicated key whose public half is in the VM's `~/.ssh/authorized_keys`); every push to
`main` then builds, publishes and runs `update.sh` on the VM.

Fallbacks (no code changes, env only):

- **Zero-card**: Vercel Hobby + Turso (`DATABASE_URL=libsql://…`) behind the free Cloudflare
  Worker proxy in `deploy/cloudflare-proxy/`.
- **GCP with billing**: Cloud Run free tier + GCS (`deploy/01-03*.sh`).

Why these shapes: `*.run.app`, `ghs.googlehosted.com`, `*.vercel.app` and
`storage.googleapis.com` are blocked or unstable from mainland China; a customer-owned GCP IP
or Cloudflare's edge is reachable. Photos are therefore always served via `/api/images/*` on
our own host.

## Spec-driven roadmap

Every feature starts as a spec in [`docs/specs/`](docs/specs/README.md) and is tracked by a
GitHub issue labelled `spec` (milestones = phases). `scripts/bootstrap-github.sh` creates
the repo, labels, milestones and issues idempotently. Architecture decisions live in
[`docs/adr/`](docs/adr/).

## Mastery state machine

```
PENDING ──L1 correct──▶ CONSOLIDATING ──L2 & L3 correct──▶ MASTERED
   ▲                        │ any wrong                        │ wrong on scheduled review
   └────────────────────────┘                                  ▼
   ◀─────────────────────────────────────────────────────── RELAPSED
```

Intervals after each successful round: 1, 2, 4, 7, 15, 30 days.

## Roadmap (see docs/specs for details)

- [ ] Whole-page capture with Gemini bounding boxes → multiple mistakes per photo
- [ ] Clean-stem rendering (handwriting removed) for printable worksheets
- [ ] Deterministic re-verification of variant answers (math.js) before saving
- [ ] Parent dashboard: radar chart by error category, weekly PDF export
- [ ] Photo grading of handwritten variant answers
