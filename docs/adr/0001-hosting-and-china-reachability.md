# ADR 0001 — Hosting and mainland-China reachability

- Status: Accepted · Date: 2026-10-26

## Context
The backend must call the Gemini API (unreachable from mainland clouds); users are on
mainland-China home networks without a VPN; budget is ~\$0. Google-owned hostnames
(`*.run.app`, `ghs.googlehosted.com`, `storage.googleapis.com`) are blocked, while customer
IPs on GCP and Cloudflare's edge are reachable.

## Decision
1. **Primary**: deploy the Next.js standalone container with Docker Compose + Caddy on the
   owner's existing GCE VM in asia-east1 (the one behind `app.watchparty.cn`), DNS `A`
   record `math.watchparty.cn` → VM IP, SQLite + photos on local disk, nightly tarball backup.
2. **Fallback A (zero-card, no VM)**: Vercel Hobby + Turso, fronted by a free Cloudflare
   Worker reverse proxy on the custom domain.
3. **Fallback B (GCP account with billing)**: Cloud Run free tier + GCS + Turso, fronted by
   the same Cloudflare Worker (`deploy/03-domain-cloudflare.sh`).
4. Photos are always served from our own origin (`/api/images/*`), never via signed GCS URLs.

## Consequences
- One moving part in production; backups are a cron job; no cold starts.
- Container images are built by GitHub Actions and published to GHCR; the VM pulls them.
- Switching to fallback A/B requires only env changes (DATABASE_URL, GCS_BUCKET) — no code.
