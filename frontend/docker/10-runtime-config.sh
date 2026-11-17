#!/bin/sh
set -eu

mkdir -p /tmp/nginx/client_temp /tmp/nginx/proxy_temp /tmp/nginx/fastcgi_temp /tmp/nginx/uwsgi_temp /tmp/nginx/scgi_temp

runtime_environment="${CARELENS_ENVIRONMENT:-production}"
auth_provider="${CARELENS_AUTH_PROVIDER:-google}"
case "$runtime_environment" in
  ''|*[!a-zA-Z0-9._-]*)
    echo "CARELENS_ENVIRONMENT contains unsupported characters" >&2
    exit 1
    ;;
esac
case "$auth_provider" in
  google|mock) ;;
  *)
    echo "CARELENS_AUTH_PROVIDER must be google or mock" >&2
    exit 1
    ;;
esac

printf 'window.CARELENS_CONFIG = Object.freeze({ environment: "%s", authProvider: "%s", apiBaseUrl: window.location.origin });\n' \
  "$runtime_environment" "$auth_provider" > /tmp/nginx/runtime-config.js
