#!/usr/bin/env bash
#
# Run a Sonar analysis of this repo against whichever server is configured.
#
#   npm run sonar:local
#
# Env-agnostic by design: sources the git-ignored .env.sonar ONLY if it exists,
# otherwise uses the SONAR_* variables already in the environment. That means
# the identical command works on a laptop, in GitHub Actions, and inside
# withSonarQubeEnv() on Jenkins with no edits.
#
# Read-only with respect to the repo: the scanner only writes .scannerwork/,
# which is git-ignored. It never touches src/ or dist/.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Ambient environment wins over the local file, so CI secrets are never
# overridden by a stale checkout of .env.sonar.
if [ -f .env.sonar ]; then
  echo "Loading .env.sonar"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    key="${line%%=*}"
    value="${line#*=}"
    key="$(echo "$key" | tr -d '[:space:]')"
    if [ -z "${!key:-}" ]; then
      export "$key=$value"
    fi
  done < .env.sonar
fi

SONAR_HOST_URL="${SONAR_HOST_URL:-http://localhost:9000}"
# The Jenkins SonarQube plugin exports SONAR_AUTH_TOKEN rather than SONAR_TOKEN.
SONAR_TOKEN="${SONAR_TOKEN:-${SONAR_AUTH_TOKEN:-}}"

if [ -z "$SONAR_TOKEN" ]; then
  echo "ERROR: no Sonar token." >&2
  echo "  local : cp .env.sonar.example .env.sonar and fill in SONAR_TOKEN" >&2
  echo "  CI    : set the SONAR_TOKEN secret (or SONAR_AUTH_TOKEN on Jenkins)" >&2
  exit 1
fi

echo "Scanning $(basename "$REPO_ROOT") -> $SONAR_HOST_URL"

# Pick a scanner, newest-usable first.
#
# The `sonarqube-scanner` npm devDependency is pinned at 2.4.1, which downloads
# sonar-scanner-cli 3.3.0 (2018). That build bundles its own Java 8 JRE and
# CANNOT analyze against SonarQube 9.9+, failing with:
#   "class file version 55.0 ... only recognizes class file versions up to 52.0"
# So it is the last resort, not the default.
#
# Override explicitly with SONAR_SCANNER_HOME=/path/to/sonar-scanner-x.y.z
SCANNER=""

# 1. Explicit override always wins.
if [ -n "${SONAR_SCANNER_HOME:-}" ] && [ -x "$SONAR_SCANNER_HOME/bin/sonar-scanner" ]; then
  SCANNER="$SONAR_SCANNER_HOME/bin/sonar-scanner"
fi

# 2. Any modern CLI already cached locally, newest first, skipping 3.3.0.
if [ -z "$SCANNER" ]; then
  SCANNER="$(find "$HOME/.sonar/native-sonar-scanner" -maxdepth 3 -type f -perm -u+x \
    -path '*/bin/sonar-scanner' 2>/dev/null \
    | grep -v '3\.3\.0' | sort -V | tail -1)"
fi

# 3. A real sonar-scanner on PATH. `npm run` prepends node_modules/.bin, whose
#    sonar-scanner is the npm shim that re-launches the broken 3.3.0 — so that
#    one must be rejected rather than treated as a system install.
if [ -z "$SCANNER" ]; then
  CANDIDATE="$(command -v sonar-scanner 2>/dev/null || true)"
  case "$CANDIDATE" in
    */node_modules/.bin/*) CANDIDATE="" ;;
  esac
  SCANNER="$CANDIDATE"
fi

# 4. Last resort: the npm package. Expected to fail on SonarQube 9.9+.
if [ -z "$SCANNER" ]; then
  echo "WARNING: falling back to the npm sonarqube-scanner (CLI 3.3.0)." >&2
  echo "         It bundles Java 8 and WILL FAIL against SonarQube 9.9+." >&2
  echo "         Install a current sonar-scanner and set SONAR_SCANNER_HOME." >&2
  SCANNER="npx --no-install sonar-scanner"
fi

echo "Using scanner: $SCANNER"

# SonarQube 9.x reads the token from sonar.login; 10.x+ uses sonar.token.
# Passing both is accepted by both generations.
exec $SCANNER \
  -Dsonar.host.url="$SONAR_HOST_URL" \
  -Dsonar.token="$SONAR_TOKEN" \
  -Dsonar.login="$SONAR_TOKEN" \
  "$@"
