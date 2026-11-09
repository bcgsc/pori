#!/bin/bash
set -euo pipefail

if [[ "$#" -ne 5 ]]; then
    echo "Usage: $0 <URL> <USER> <PASS> <REALM> <KEYFILE>" >&2
    exit 1
fi

KEYCLOAK_URL=${1%/}
KEYCLOAK_USER=$2
KEYCLOAK_PASSWORD=$3
KEYCLOAK_REALM=$4
KEYFILE=$5

fail() {
    echo "Keycloak healthcheck: $*" >&2
    exit 1
}

# Bound both requests so the script finishes within Compose's 10s timeout.
# Never print credentials, tokens, or response bodies to the healthcheck log.
auth_resp=$(curl --fail --silent --show-error --noproxy '*' --connect-timeout 2 --max-time 4 \
    "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    --data-urlencode "username=${KEYCLOAK_USER}" \
    --data-urlencode "password=${KEYCLOAK_PASSWORD}" \
    --data-urlencode 'grant_type=password' \
    --data-urlencode 'client_id=admin-cli') || fail "admin token request failed"

token=$(jq -er '.access_token | strings | select(length > 0)' <<< "$auth_resp") \
    || fail "admin token missing from response"

resp=$(curl --fail --silent --show-error --noproxy '*' --connect-timeout 2 --max-time 4 \
    "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/keys" \
    -H 'Accept: application/json' \
    -H "Authorization: Bearer ${token}") || fail "realm signing-key request failed"

key=$(jq -er '[.keys[] | select(.status == "ACTIVE" and .type == "RSA" and .algorithm == "RS256" and .use == "SIG") | .publicKey | strings | select(length > 0)][0] // empty' <<< "$resp") \
    || fail "active RS256 signing key missing from realm response"

# Publish atomically: a failed check must not truncate a working key file.
tmp_key=$(mktemp "${KEYFILE}.XXXXXX") || fail "cannot write key directory"
trap 'rm -f -- "$tmp_key"' EXIT
printf '%s\n' '-----BEGIN PUBLIC KEY-----' "$key" '-----END PUBLIC KEY-----' > "$tmp_key"
openssl pkey -pubin -in "$tmp_key" -noout 2>/dev/null || fail "invalid realm public key"
chmod 644 "$tmp_key"
mv -f -- "$tmp_key" "$KEYFILE"
echo "Keycloak ready: realm signing key written"
