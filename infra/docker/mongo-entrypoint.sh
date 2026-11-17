#!/bin/bash
set -euo pipefail

if [[ -z "${MONGO_REPLICA_KEY:-}" || ${#MONGO_REPLICA_KEY} -lt 6 ]]; then
  echo "MONGO_REPLICA_KEY must contain at least six characters" >&2
  exit 1
fi
printf '%s' "$MONGO_REPLICA_KEY" > /tmp/mongo-keyfile
chown mongodb:mongodb /tmp/mongo-keyfile
chmod 400 /tmp/mongo-keyfile
exec /usr/local/bin/docker-entrypoint.sh mongod --replSet rs0 --bind_ip_all --keyFile /tmp/mongo-keyfile
