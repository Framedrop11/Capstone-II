FROM node:22-bookworm-slim AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
RUN npm ci
COPY . .
RUN npm run fe:build

FROM nginx:1.30.6-alpine3.24 AS runtime
RUN apk upgrade --no-cache
COPY --from=build /workspace/frontend/dist /usr/share/nginx/html
COPY frontend/docker/nginx.conf /etc/nginx/nginx.conf
COPY frontend/docker/default.conf /etc/nginx/conf.d/carelens.conf
COPY frontend/docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY frontend/docker/api-security-headers.conf /etc/nginx/snippets/api-security-headers.conf
COPY --chmod=755 frontend/docker/10-runtime-config.sh /docker-entrypoint.d/10-runtime-config.sh
RUN rm -f /etc/nginx/conf.d/default.conf \
    && mkdir -p /tmp/nginx/client_temp /tmp/nginx/proxy_temp /tmp/nginx/fastcgi_temp /tmp/nginx/uwsgi_temp /tmp/nginx/scgi_temp \
    && chown -R 101:101 /tmp/nginx /usr/share/nginx/html
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
