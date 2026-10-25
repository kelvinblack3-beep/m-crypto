#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Typechecking api-service..."
(cd "$ROOT/api-service" && bun install --frozen-lockfile && bun run typecheck)

echo "Typechecking auth-service..."
(cd "$ROOT/auth-service" && bun install --frozen-lockfile && bun run typecheck)

echo "Running tests..."
(cd "$ROOT/api-service" && bun run test)
(cd "$ROOT/auth-service" && bun run test)

echo "verify_dev OK."
