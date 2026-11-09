# Load SMTP settings from keycloak/.env, relative to this script rather than the working directory.
# Export its assignments so Compose can interpolate them; preserve the caller's allexport setting.
_pori_load_smtp_env() {
	local smtp_env="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/keycloak/.env"
	local restore_allexport=false
	[[ -o allexport ]] || restore_allexport=true
	set -a
	source "${smtp_env}"
	if [[ "${restore_allexport}" == true ]]; then
		set +a
	fi
}
_pori_load_smtp_env
unset -f _pori_load_smtp_env

# Host/IP that browsers use to reach the PORI services (keycloak, clients, APIs)
export PORI_HOST='127.0.0.1'

# This shell enables user to set up the servers using either http only or
# https:// proxies which will require top level apache server to configure the URLs.

# Browser-facing URLs. Override individual URLs here for separate hosts or proxies.
export IPR_CLIENT_URI="http://${PORI_HOST}:3000"
export GRAPHKB_CLIENT_URI="http://${PORI_HOST}:5000"
export KEYCLOAK_BROWSER_URI="http://${PORI_HOST}:8888/auth"
export GRAPHKB_API_BASE_URL="http://${PORI_HOST}:8080"
export IPR_API_BASE_URL="http://${PORI_HOST}:8081/api"
export GRAPHKB_PUBLIC_PATH='/'
export IPR_PUBLIC_PATH='/'

# Container-facing URLs. These must be reachable from the app-network.
export KEYCLOAK_INTERNAL_URI='http://keycloak:8888/auth'
export GKB_KEYCLOAK_URI="${KEYCLOAK_INTERNAL_URI}/realms/PORI/protocol/openid-connect/token"
export IPR_KEYCLOAK_URI="${KEYCLOAK_INTERNAL_URI}/realms/PORI/protocol/openid-connect/token"
export IPR_GRAPHKB_URI='http://graphkb_api:8080/api'

# Health-check URLs. Keep these pointed at the corresponding container services.
export GRAPHKB_HEALTHCHECK_URI='http://graphkb_api:8080/api/version'
export IPR_HEALTHCHECK_URI='http://ipr_api:8080/api/spec.json'