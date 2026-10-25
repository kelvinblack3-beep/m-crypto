#!/usr/bin/env bash

# This script is the legacy Modal deploy path. `newly deploy` on the control
# plane applies the bundled `drizzle/` migrations itself, with the same per-service ledger.

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "deploy.sh: env and project_id are required" >&2
  exit 1
fi

ENV_NAME="$1"
TENANT_ID="$2"
shift 2
REQUESTED_SERVICES=("$@")

require_env() {
  local key="$1"
  local message="$2"
  if [ -z "${!key:-}" ]; then
    echo "deploy.sh: ${message}" >&2
    exit 1
  fi
}

if [ "$ENV_NAME" != "dev" ] && [ "$ENV_NAME" != "prod" ]; then
  echo "deploy.sh: env must be dev or prod" >&2
  exit 1
fi

require_env CLOUDFLARE_TENANT_NAMESPACE "deployment target is not configured"

if ! command -v jq >/dev/null 2>&1; then
  echo "deploy.sh: jq is required to prepare deployment configuration" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_MANIFEST="${ROOT}/newly.services.json"

if [ ! -f "$SERVICE_MANIFEST" ]; then
  SERVICE_MANIFEST="$(mktemp)"
  cat > "$SERVICE_MANIFEST" <<'JSON'
{"services":[
  {"name":"api","path":"api-service","type":"worker","schema":"api","secrets":"api","public":true},
  {"name":"auth","path":"auth-service","type":"worker","schema":"auth","secrets":"auth","public":true}
]}
JSON
fi

if ! jq -e '.services | type == "array" and length > 0' "$SERVICE_MANIFEST" >/dev/null; then
  echo "deploy.sh: newly.services.json must contain a non-empty services array" >&2
  exit 1
fi

env_key_for_service() {
  local name="$1"
  printf 'ENV_%s_SECRETS_JSON' "$(printf '%s' "$name" | tr '[:lower:]-' '[:upper:]_')"
}

service_json() {
  local name="$1"
  jq -cer --arg name "$name" '.services[] | select(.name == $name)' "$SERVICE_MANIFEST"
}

selected_services_json() {
  if [ "${#REQUESTED_SERVICES[@]}" -eq 0 ]; then
    jq -cer '.services[]' "$SERVICE_MANIFEST"
    return
  fi

  local requested
  for requested in "${REQUESTED_SERVICES[@]}"; do
    if ! service_json "$requested" >/dev/null; then
      echo "deploy.sh: service '${requested}' not found in newly.services.json" >&2
      exit 1
    fi
    service_json "$requested"
  done
}

load_tenant_database_url() {
  local secret_scope="$1"
  local bundle_var
  bundle_var="$(env_key_for_service "$secret_scope")"
  local bundle="${!bundle_var:-}"
  if [ -z "$bundle" ]; then
    echo "deploy.sh: service environment is missing for ${secret_scope}" >&2
    exit 1
  fi
  local tenant_db_url
  tenant_db_url=$(echo "$bundle" | jq -er '.DATABASE_URL // empty')
  if [ -z "$tenant_db_url" ]; then
    echo "deploy.sh: database configuration is missing for ${secret_scope}" >&2
    exit 1
  fi
  if echo "$tenant_db_url" | grep -qiE '(natively-(dev|prod)|comprendly|finalquest)'; then
    echo "deploy.sh: refusing to deploy with a reserved database host" >&2
    exit 1
  fi
  export DATABASE_URL="$tenant_db_url"
}

deploy_service() {
  local svc_json="$1"
  local service_name service_path service_type pg_schema secret_scope
  service_name="$(jq -er '.name' <<<"$svc_json")"
  service_path="$(jq -er '.path' <<<"$svc_json")"
  service_type="$(jq -er '.type // "worker"' <<<"$svc_json")"
  pg_schema="$(jq -er '.schema // ""' <<<"$svc_json")"
  secret_scope="$(jq -er '.secrets // .name' <<<"$svc_json")"

  if [[ ! "$service_name" =~ ^[a-z][a-z0-9-]{0,31}$ ]]; then
    echo "deploy.sh: invalid service name '${service_name}'" >&2
    exit 1
  fi
  if [[ ! "$secret_scope" =~ ^[a-z][a-z0-9-]{0,31}$ ]]; then
    echo "deploy.sh: invalid service configuration for ${service_name}" >&2
    exit 1
  fi
  if [[ "$service_path" = /* || "$service_path" == *".."* ]]; then
    echo "deploy.sh: invalid service path '${service_path}' for ${service_name}" >&2
    exit 1
  fi
  if [ "$service_type" != "worker" ]; then
    echo "deploy.sh: unsupported service type '${service_type}' for ${service_name}" >&2
    exit 1
  fi

  local script_name="${TENANT_ID}-${service_name}"
  echo "Deploying ${service_name} (${service_path}) ..."
  cd "${ROOT}/${service_path}"

  bun install --frozen-lockfile

  if [ -n "$pg_schema" ]; then
    load_tenant_database_url "$secret_scope"

    # Migrations are the only way this database changes. The service ships a
    # baseline migration that creates its schema, so nothing here pre-creates
    # it: two writers of the same DDL is what made the first deploy fail with
    # `schema "${pg_schema}" already exists`.
    if [ ! -f "drizzle/meta/_journal.json" ]; then
      echo "deploy.sh: ${service_name} has no drizzle/ migrations; run 'bun run db:generate' in ${service_path}" >&2
      exit 1
    fi
    bunx drizzle-kit migrate
  else
    echo "deploy.sh: ${service_name} has no database schema configured; skipping database step"
  fi

  require_env R2_BUCKET_BLOBS "backend storage is not configured"
  require_env R2_BUCKET_STORAGE "backend storage is not configured"
  require_env R2_BUCKET_PUBLIC "public storage is not configured"
  require_env CF_QUEUE_DEFAULT "background jobs are not configured"
  require_env UPTRACE_OTLP_URL "observability endpoint is not configured"
  sed -i \
    -e "s|REPLACE_BLOBS|${R2_BUCKET_BLOBS}|g" \
    -e "s|REPLACE_STORAGE|${R2_BUCKET_STORAGE}|g" \
    -e "s|REPLACE_PUBLIC|${R2_BUCKET_PUBLIC}|g" \
    -e "s|REPLACE_QUEUE|${CF_QUEUE_DEFAULT}|g" \
    -e "s|REPLACE_NEWLY_PROJECT_ID|${TENANT_ID}|g" \
    -e "s|REPLACE_UPTRACE_OTLP_URL|${UPTRACE_OTLP_URL}|g" \
    wrangler.toml

  local denylist
  case "${secret_scope}" in
    api)
      denylist='["CF_QUEUE_DEFAULT","CF_TENANT_ID","NEWLY_ENV","NEWLY_PROJECT_ID"]'
      ;;
    auth)
      denylist='["NEWLY_ENV","NEWLY_PROJECT_ID"]'
      ;;
    *)
      denylist='["CF_QUEUE_DEFAULT","CF_TENANT_ID","NEWLY_ENV","NEWLY_PROJECT_ID"]'
      ;;
  esac

  bunx wrangler deploy \
    --dispatch-namespace "${CLOUDFLARE_TENANT_NAMESPACE}" \
    --name "${script_name}"

  require_env CLOUDFLARE_ACCOUNT_ID "deployment credentials are missing"
  require_env CLOUDFLARE_API_TOKEN "deployment credentials are missing"
  local bundle_var
  bundle_var="$(env_key_for_service "$secret_scope")"
  local service_bundle="${!bundle_var:-{}}"
  local secrets_count=0
  while IFS=$'\t' read -r secret_name secret_value; do
    [ -z "$secret_name" ] && continue
    local status
    status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
      -X PUT \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data @<(jq -n --arg name "$secret_name" --arg text "$secret_value" \
        '{name: $name, text: $text, type: "secret_text"}') \
      "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/dispatch/namespaces/${CLOUDFLARE_TENANT_NAMESPACE}/scripts/${script_name}/secrets")
    if [ "$status" != "200" ] && [ "$status" != "201" ]; then
      echo "deploy.sh: failed to apply runtime configuration for ${service_name}: HTTP ${status}" >&2
      exit 1
    fi
    secrets_count=$((secrets_count + 1))
  done < <(printf '%s' "$service_bundle" | jq -r --argjson deny "$denylist" '
    with_entries(select(.key as $k | ($deny | index($k) | not)))
    | with_entries(select(.value != null and .value != ""))
    | to_entries
    | .[]
    | "\(.key)\t\(.value)"
  ')
  echo "deploy.sh: applied ${secrets_count} runtime setting(s) for ${service_name}"
}

SELECTED_SERVICES_JSON="$(selected_services_json)"
while IFS= read -r svc_json; do
  [ -z "$svc_json" ] && continue
  deploy_service "$svc_json"
done <<< "$SELECTED_SERVICES_JSON"

if [ "$ENV_NAME" = "prod" ]; then
  HOST_SUFFIX="api.newlyapp.com"
else
  HOST_SUFFIX="api-dev.newlyapp.com"
fi
AUTH_URL="https://auth-${TENANT_ID}-${ENV_NAME}.${HOST_SUFFIX}"
API_URL="https://api-${TENANT_ID}-${ENV_NAME}.${HOST_SUFFIX}"

DEPLOY_SOURCE="${NEWLY_DEPLOY_SOURCE:-agent}"

if [ -n "${NEWLY_CONTROL_PLANE_URL:-}" ] && [ -n "${NEWLY_SANDBOX_TOKEN:-}" ]; then
  CALLBACK_PAYLOAD=$(jq -n \
    --arg env "$ENV_NAME" \
    --arg auth "$AUTH_URL" \
    --arg api "$API_URL" \
    --arg src "$DEPLOY_SOURCE" \
    --arg sha "${NEWLY_DEPLOY_SHA:-}" \
    '{env: $env, auth_url: $auth, api_url: $api, source: $src, git_sha: $sha}')
  CALLBACK_URL="${NEWLY_CONTROL_PLANE_URL%/}/newly_backend/record_deploy/${TENANT_ID}"
  CALLBACK_STATUS=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    -X POST "$CALLBACK_URL" \
    -H "Authorization: Bearer $NEWLY_SANDBOX_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$CALLBACK_PAYLOAD")
  if [ "$CALLBACK_STATUS" = "200" ]; then
    echo "deploy.sh: deployment status updated"
  else
    echo "deploy.sh: deployment finished, but status update returned HTTP ${CALLBACK_STATUS}" >&2
  fi
else
  echo "deploy.sh: deployment status update skipped; status may remain pending" >&2
fi

echo "Deploy complete."
