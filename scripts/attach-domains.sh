#!/usr/bin/env bash
# Attach custom domains to the flofischer Worker after first deploy.
# Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
# Optional: ZONE_ID (auto-resolved for flofischer.org if missing)
set -euo pipefail

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"
TOKEN="${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN}"
SCRIPT="flofischer"
ZONE_NAME="flofischer.org"

API="https://api.cloudflare.com/client/v4"
auth=(-H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json")

if [[ -z "${ZONE_ID:-}" ]]; then
  ZONE_ID=$(curl -sS "${API}/zones?name=${ZONE_NAME}" "${auth[@]}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result'][0]['id'] if d.get('result') else '')")
  if [[ -z "$ZONE_ID" ]]; then
    echo "Zone ${ZONE_NAME} not found on this account." >&2
    exit 1
  fi
  echo "Zone ID: ${ZONE_ID}"
fi

# Prefer Workers Custom Domains API
domains=(flofischer.org www.flofischer.org seele.flofischer.org gehirn.flofischer.org)

for host in "${domains[@]}"; do
  echo "→ Attaching ${host} …"
  resp=$(curl -sS -X POST \
    "${API}/accounts/${ACCOUNT_ID}/workers/domains" \
    "${auth[@]}" \
    --data "{\"hostname\":\"${host}\",\"service\":\"${SCRIPT}\",\"zone_id\":\"${ZONE_ID}\",\"environment\":\"production\"}" \
    || true)
  echo "$resp" | python3 -c "import sys,json
try:
  d=json.load(sys.stdin)
  if d.get('success'):
    print('  OK', d.get('result',{}).get('hostname',''))
  else:
    print('  ', d.get('errors') or d)
except Exception as e:
  print('  raw response parse error', e)
"
done

echo "Done. Check DNS/SSL in the Cloudflare dashboard if a host is pending."
