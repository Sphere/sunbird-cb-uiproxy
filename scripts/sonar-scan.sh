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

# SonarQube 9.x reads the token from sonar.login; 10.x+ uses sonar.token.
# Passing both is accepted by both generations.
exec npx --no-install sonar-scanner \
  -Dsonar.host.url="$SONAR_HOST_URL" \
  -Dsonar.token="$SONAR_TOKEN" \
  -Dsonar.login="$SONAR_TOKEN" \
  "$@"
