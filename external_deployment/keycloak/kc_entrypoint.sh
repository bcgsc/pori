#!/bin/bash
# Injects SMTP settings from SMTP_* environment variables into the realm import
# file, then hands off to the Keycloak (26.x, Quarkus) launcher.
# SMTP_* is used instead of KC_SMTP_* because the KC_ prefix is reserved for
# Keycloak server configuration options.
set -euo pipefail

REALM_FILE=${PORI_REALM_FILE:-/opt/keycloak/data/import/PORI-realm.json}
EMPTY_SMTP='"smtpServer" : { }'
REDIRECT_ANCHOR='"https://pori-demo.bcgsc.ca/*"'

json_escape() {
    local s=$1
    s=${s//\\/\\\\}
    s=${s//\"/\\\"}
    printf '%s' "$s"
}

content=$(<"$REALM_FILE")

# Inject SMTP settings into the realm import (realm import has no SMTP defaults)
if [[ -n "${SMTP_HOST:-}" ]]; then
    smtp=$(cat <<EOF
"smtpServer" : {
    "host" : "$(json_escape "$SMTP_HOST")",
    "port" : "$(json_escape "${SMTP_PORT:-587}")",
    "from" : "$(json_escape "${SMTP_FROM:-}")",
    "fromDisplayName" : "$(json_escape "${SMTP_FROM_DISPLAY_NAME:-}")",
    "starttls" : "$(json_escape "${SMTP_STARTTLS:-false}")",
    "ssl" : "$(json_escape "${SMTP_SSL:-false}")",
    "auth" : "$(json_escape "${SMTP_AUTH:-false}")",
    "user" : "$(json_escape "${SMTP_USER:-}")",
    "password" : "$(json_escape "${SMTP_PASSWORD:-}")"
  }
EOF
)
    content=${content/"$EMPTY_SMTP"/"$smtp"}
    echo "Configured SMTP server ${SMTP_HOST}:${SMTP_PORT:-587} for realm import"
fi

# Dynamically add redirect URIs to keycloak realm settings for the IPR and GraphKB clients.
# If the URIs are not explicitly set, script will use the specified PORI_HOST and default ports 3000 and 5000 for IPR and GraphKB, respectively.
redirect_uris=()
if [[ -n "${IPR_CLIENT_URI:-}" ]]; then
    redirect_uris+=("${IPR_CLIENT_URI}")
fi
if [[ -n "${GRAPHKB_CLIENT_URI:-}" ]]; then
    redirect_uris+=("${GRAPHKB_CLIENT_URI}")
fi
if [[ -n "${PORI_HOST:-}" ]]; then
    if [[ -z "${IPR_CLIENT_URI:-}" ]]; then
        redirect_uris+=("http://${PORI_HOST}:3000")
    fi
    if [[ -z "${GRAPHKB_CLIENT_URI:-}" ]]; then
        redirect_uris+=("http://${PORI_HOST}:5000")
    fi
fi

if [[ ${#redirect_uris[@]} -gt 0 ]]; then
    extra=""
    for redirect_uri in "${redirect_uris[@]}"; do
        normalized_uri="${redirect_uri%/}"
        json_uri="\"${normalized_uri}/*\""
        if [[ "$content" != *"$json_uri"* ]]; then
            extra="${extra:+${extra}, }${json_uri}"
        fi
    done
    if [[ -n "$extra" ]]; then
        content=${content//"$REDIRECT_ANCHOR"/"${extra}, $REDIRECT_ANCHOR"}
        echo "Added redirect URIs for ${redirect_uris[*]}"
    fi
fi

# Keycloak 25+ no longer puts "nonce" in access/refresh tokens or "session_state" in any token.
# The IPR (keycloak-js 22) and GraphKB (keycloak-js 21) clients still validate the nonce of every
# token; on mismatch they clear the token and, with onLoad 'login-required', redirect to the login
# page again, which immediately redirects back (infinite loop). Restore the pre-25 claims with the
# backwards-compatible mappers recommended by the Keycloak 25 upgrade guide.
# Remove once both clients use keycloak-js >= 24.0.4.
legacy_mappers='[
  {
    "name" : "session_state",
    "protocol" : "openid-connect",
    "protocolMapper" : "oidc-session-state-mapper",
    "consentRequired" : false,
    "config" : {
      "access.token.claim" : "true",
      "id.token.claim" : "true",
      "introspection.token.claim" : "true"
    }
  },
  {
    "name" : "nonce backwards compatible",
    "protocol" : "openid-connect",
    "protocolMapper" : "oidc-nonce-backwards-compatible-mapper",
    "consentRequired" : false,
    "config" : { }
  }
]'
content=$(jq --argjson mappers "$legacy_mappers" '
  .clients |= map(
    if .clientId == "IPR" or .clientId == "GraphKB" then
      .protocolMappers = (
        ((.protocolMappers // []) | map(select(.name as $n | ($mappers | map(.name) | index($n)) == null)))
        + $mappers
      )
    else . end
  )' <<<"$content")
echo "Added legacy keycloak-js compatibility mappers (session_state, nonce) to IPR and GraphKB clients"

printf '%s\n' "$content" > "$REALM_FILE"

exec /opt/keycloak/bin/kc.sh "$@"
