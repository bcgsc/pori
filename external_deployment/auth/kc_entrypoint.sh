#!/bin/bash
# Configures new realms and reconciles persisted realms through the Admin API.
# SMTP_* is used instead of KC_SMTP_* because the KC_ prefix is reserved for
# Keycloak server configuration options.
set -euo pipefail

REALM_FILE=${PORI_REALM_FILE:-/opt/keycloak/data/import/PORI-realm.json}

# Do not launch a server/reconciler for commands such as build or show-config.
case "${1:-}" in
  start|start-dev) ;;
  *) exec /opt/keycloak/bin/kc.sh "$@" ;;
esac

READY_FILE=/tmp/pori-realm-ready
rm -f -- "$READY_FILE"
: "${KC_BOOTSTRAP_ADMIN_USERNAME:?An existing admin username is required}"
: "${KC_BOOTSTRAP_ADMIN_PASSWORD:?The existing admin password is required}"

# jq handles arbitrary JSON whitespace and escaping, including SMTP secrets.
smtp=$(jq -n 'def default($value): if . == null or . == "" then $value else . end;
  {host: env.SMTP_HOST, port: (env.SMTP_PORT | default("587")),
  from: (env.SMTP_FROM // ""), fromDisplayName: (env.SMTP_FROM_DISPLAY_NAME // ""),
  starttls: (env.SMTP_STARTTLS | default("false")), ssl: (env.SMTP_SSL | default("false")),
  auth: (env.SMTP_AUTH | default("false")), user: (env.SMTP_USER // ""),
  password: (env.SMTP_PASSWORD // "")}')
ipr_uri=${IPR_CLIENT_URI:-${PORI_HOST:+http://${PORI_HOST}:3000}}
graphkb_uri=${GRAPHKB_CLIENT_URI:-${PORI_HOST:+http://${PORI_HOST}:5000}}
client_uris=$(jq -n --arg ipr "$ipr_uri" --arg graphkb "$graphkb_uri" '
  {IPR: $ipr, GraphKB: $graphkb} | with_entries(select(.value != ""))
  | map_values([((rtrimstr("/") | rtrimstr("/*")) + "/*")])')

# Only remove redirects previously owned by this script. Unknown/manual URLs
# (including those from deployments predating this marker) remain untouched.
configure_client() {
  jq --argjson uris "$client_uris" '
    if $uris[.clientId] != null then
    (.attributes["pori.managedRedirectUris"] // "[]" | fromjson) as $old
    | $uris[.clientId] as $new
    | .redirectUris = (((.redirectUris // []) - $old + $new) | unique)
    | .attributes["pori.managedRedirectUris"] = ($new | tojson)
    else . end'
}

content=$(<"$REALM_FILE")
if [[ -n "${SMTP_HOST:-}" ]]; then
  content=$(jq --argjson smtp "$smtp" '.smtpServer = ((.smtpServer // {}) + $smtp)' <<<"$content")
fi
clients=$(jq -c '.clients[]' <<<"$content" | while IFS= read -r client; do
  configure_client <<<"$client"
done | jq -s '.')
content=$(jq --argjson clients "$clients" '.clients = $clients' <<<"$content")

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

# Keep PID 1 responsible for shutdown and exit codes while the API becomes ready.
# Any reconciliation error stops Keycloak rather than serving stale configuration.
/opt/keycloak/bin/kc.sh "$@" &
server_pid=$!
cleanup() {
  rm -f -- "$READY_FILE"
  kill -TERM "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

# Normalize the relative path without depending on external/public DNS or TLS.
base_url="http://127.0.0.1:${KC_HTTP_PORT:-8080}"
relative_path=${KC_HTTP_RELATIVE_PATH:-/}
base_url+="/${relative_path#/}"
base_url=${base_url%/}
realm=$(jq -er '.realm | strings | select(length > 0) | @uri' <<<"$content")
curl_args=(--fail --silent --show-error --noproxy '*' --connect-timeout 2 --max-time 4)
token=''
for ((attempt=0; attempt<60; attempt++)); do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo 'Keycloak exited before realm reconciliation' >&2
    exit 1
  fi
  if auth_response=$(curl "${curl_args[@]}" \
    "$base_url/realms/master/protocol/openid-connect/token" \
    --data-urlencode "username=$KC_BOOTSTRAP_ADMIN_USERNAME" \
    --data-urlencode "password=$KC_BOOTSTRAP_ADMIN_PASSWORD" \
    --data-urlencode 'grant_type=password' --data-urlencode 'client_id=admin-cli') &&
    token=$(jq -er '.access_token | strings | select(length > 0)' <<<"$auth_response"); then
    break
  fi
  sleep 2
done
if [[ -z "$token" ]]; then
  echo 'Keycloak admin login timed out; check the persisted admin credentials' >&2
  exit 1
fi

admin_api() {
  curl "${curl_args[@]}" -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' "$@"
}

if [[ -n "${SMTP_HOST:-}" ]]; then
  # Read/merge SMTP only; never send an imported realm or users to this endpoint.
  current=$(admin_api "$base_url/admin/realms/$realm")
  payload=$(jq --argjson smtp "$smtp" '{smtpServer: ((.smtpServer // {}) + $smtp)}' <<<"$current")
  admin_api -X PUT "$base_url/admin/realms/$realm" --data-binary "$payload"
  echo 'Reconciled realm SMTP settings'
fi
while IFS= read -r client_id; do
  current=$(admin_api "$base_url/admin/realms/$realm/clients?clientId=$client_id")
  client=$(jq -ce --arg id "$client_id" '
    [.[] | select(.clientId == $id)]
    | if length == 1 then .[0]
      else error("Client \($id): expected one match, found \(length)") end' <<<"$current")
  id=$(jq -er '.id | @uri' <<<"$client")
  payload=$(configure_client <<<"$client" | jq '{redirectUris, attributes}')
  admin_api -X PUT "$base_url/admin/realms/$realm/clients/$id" --data-binary "$payload"
  echo "Reconciled $client_id client redirects"
done < <(jq -r 'keys[]' <<<"$client_uris")

touch "$READY_FILE"
echo 'Reconciled PORI SMTP and client redirects; existing users and realm settings preserved'
wait "$server_pid"
