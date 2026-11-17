FROM node:22.17.1-alpine3.22 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --workspaces=false
COPY packages ./packages
COPY services/core-api ./services/core-api
COPY services/worker ./services/worker
COPY tsconfig.json tsconfig.runtime.json tsconfig.worker.json ./
RUN npx tsc -p tsconfig.runtime.json && npm run worker:build

FROM node:22.17.1-alpine3.22 AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --workspaces=false --omit=dev && npm cache clean --force

FROM node:22.17.1-alpine3.22 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node services/core-api/openapi ./services/core-api/openapi
COPY --chown=node:node services/core-api/migrations ./services/core-api/migrations
COPY --chown=node:node services/core-api/migrate-mongo-config.cjs ./services/core-api/migrate-mongo-config.cjs
COPY --chown=node:node scripts ./scripts
USER node
EXPOSE 3000 9464
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/core-api/services/core-api/src/server.js"]
