#!/usr/bin/env bash
# Run with bash compose.sh up -d (or any other Compose subcommand).
# Customize deployment URLs in external_deployment_env.sh.
set -euo pipefail

deployment_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
compose_file="${deployment_dir}/docker-compose.yml"
source "${deployment_dir}/external_deployment_env.sh"
: "${PORI_HOST:?Set PORI_HOST in external_deployment_env.sh}"

# Do not load a .env file; use the variables exported by the shell script.
# Add --force-recreate at the end of the command line to force recreation of all containers, even if their configuration has not changed.
# Rebuild/recreate only applies to `up`, not diagnostic commands such as `logs`.
if [[ "${1:-}" == 'up' ]]; then
    set -- "$@" --build --remove-orphans
fi
exec docker compose --env-file /dev/null \
    -f "${compose_file}" "$@"