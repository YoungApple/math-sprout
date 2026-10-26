#!/usr/bin/env bash
# Rewrite package-lock.json "resolved" URLs from the Google-internal npm mirror to npmjs.org.
# Pure text transform (integrity hashes are unchanged); needed because GitHub Actions cannot
# reach the mirror, and the mirror uses a different tarball path for scoped packages.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import re
p = "package-lock.json"; s = open(p).read()
s = s.replace("http://airlock-proxy.uplink.goog:999/npm/artifact-foundry-prod/npm-3p-limited-internal-use/", "https://registry.npmjs.org/")
s = re.sub(r'(https://registry\.npmjs\.org/(@[^/"]+)/([^/"]+)/-/)\2/', r'\1', s)
open(p, "w").write(s)
assert "airlock" not in s and "/-/@" not in s
print("lockfile OK (public registry URLs)")
PY
