#!/usr/bin/env bash
# Creates the GitHub repo (if missing), labels, milestones and one tracking issue per spec.
# Idempotent: re-running updates nothing destructive and skips issues that already exist.
# Requires: gh auth login -h github.com (account: YoungApple)
set -euo pipefail
OWNER="${GH_OWNER:-YoungApple}"
REPO="${GH_REPO:-math-sprout}"
FULL="$OWNER/$REPO"
cd "$(dirname "$0")/.."

if ! gh repo view "$FULL" >/dev/null 2>&1; then
  gh repo create "$FULL" --public --source . --remote origin --push \
    --description "AI 小学数学错题本：拍照→错因诊断→苏格拉底提示→举一反三→艾宾浩斯复习 (Next.js + Gemini)"
else
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$FULL.git"
  git push -u origin main
fi

label() { gh label create "$1" --repo "$FULL" --color "$2" --description "$3" --force >/dev/null; }
label spec        "0E8A16" "Tracks a spec in docs/specs"
label phase:P1    "1D76DB" "Core loop"
label phase:P2    "5319E7" "Routine"
label phase:P3    "B60205" "Insight"
label bug         "D73A4A" "Something is broken"
label infra       "FBCA04" "Deploy / CI / hosting"
label quality     "C2E0C6" "Eval, golden sets, prompt tuning"

milestone() {
  gh api "repos/$FULL/milestones" --jq '.[].title' | grep -qx "$1" || \
    gh api -X POST "repos/$FULL/milestones" -f title="$1" -f description="$2" >/dev/null
}
milestone "P1 Core loop"  "Photo → diagnosis → hints → L1–L3 quiz → due queue"
milestone "P2 Routine"    "Page capture, clean stem, daily session, variant verification"
milestone "P3 Insight"    "Parent dashboard, worksheet PDF, photo grading, accounts"

issue() { # id title phase status
  local id="$1" title="$2" phase="$3" status="$4" file
  file=$(ls docs/specs/"$id"-*.md)
  local full_title="$id: $title"
  if gh issue list --repo "$FULL" --search "\"$full_title\" in:title" --state all --json title --jq '.[].title' | grep -qxF "$full_title"; then
    echo "exists: $full_title"; return
  fi
  local ms; case "$phase" in P1) ms="P1 Core loop";; P2) ms="P2 Routine";; P3) ms="P3 Insight";; esac
  local body
  body=$(printf 'Spec: [%s](https://github.com/%s/blob/main/%s)\n\nStatus: **%s**\n\n---\n\n%s' "$file" "$FULL" "$file" "$status" "$(tail -n +2 "$file")")
  local num
  num=$(gh issue create --repo "$FULL" --title "$full_title" --body "$body" --label spec --label "phase:$phase" --milestone "$ms" | grep -oE '[0-9]+$')
  echo "created #$num: $full_title"
  if [ "$status" = "Implemented (MVP)" ]; then
    gh issue comment "$num" --repo "$FULL" --body "Shipped in the MVP skeleton. Remaining acceptance checks stay open here." >/dev/null
  fi
}

issue S01 "Single-problem capture"                         P1 "Implemented (MVP)"
issue S02 "Gemini diagnosis & structured output"           P1 "Implemented (MVP)"
issue S03 "Socratic hints & visual scaffolding"            P1 "Implemented (MVP)"
issue S04 "L1–L3 variant quiz & grading"                   P1 "Implemented (MVP)"
issue S05 "Mastery state machine & review queue"           P1 "Implemented (MVP)"
issue S06 "Whole-page capture with auto-segmentation"      P2 "Proposed"
issue S07 "Clean stem & handwriting layer"                 P2 "Proposed"
issue S08 "Daily 10-minute session & streaks"              P2 "Proposed"
issue S12 "Deterministic variant verification"             P2 "Proposed"
issue S09 "Parent dashboard & weekly report"               P3 "Proposed"
issue S10 "Printable worksheet export"                     P3 "Proposed"
issue S11 "Photo grading of handwritten quiz answers"      P3 "Proposed"
issue S13 "Accounts & multi-child profiles"                P3 "Proposed"

infra_issue() {
  local title="$1" body="$2"
  gh issue list --repo "$FULL" --search "\"$title\" in:title" --state all --json title --jq '.[].title' | grep -qxF "$title" && { echo "exists: $title"; return; }
  gh issue create --repo "$FULL" --title "$title" --body "$body" --label infra --milestone "P1 Core loop" >/dev/null && echo "created: $title"
}
infra_issue "Deploy MVP to math.watchparty.cn (GCE VM, Docker Compose + Caddy)" \
"See docs/adr/0001 and deploy/vm/.

- [ ] VM reachable on 22/80/443 (GCP VPC firewall + host firewall)
- [ ] Docker Engine + compose plugin on VM
- [ ] \`deploy/vm/install.sh\` run; \`.env\` filled (GEMINI_API_KEY, FAMILY_PASSCODE)
- [ ] DNSPod: A record \`math\` → VM IP
- [ ] Caddy certificate issued; https://math.watchparty.cn loads
- [ ] GitHub repo variables VM_HOST / VM_USER and secret VM_SSH_KEY → auto deploy on push
- [ ] Nightly \`backup.sh\` in crontab
- [ ] Multi-province reachability probe (ping.chinaz.com)"
infra_issue "Golden set: 20 real mistake photos for diagnosis quality" \
"Collect 20 anonymised photos across grades 1–6 and error types. For each, record expected error_category and a one-line root cause. Use to evaluate prompt/model changes (label: quality)."

echo "✅ GitHub bootstrap complete: https://github.com/$FULL/issues"
