#!/bin/sh
set -eu
if docker compose version >/dev/null 2>&1; then
    exec docker compose "$@"
fi
if command -v docker-compose >/dev/null 2>&1; then
    exec docker-compose "$@"
fi
printf '%s\n' 'Docker Compose is required. Install Docker Desktop or the Docker Compose plugin.' >&2
exit 1
