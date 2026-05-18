FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/backoffice/package.json apps/backoffice/package.json
COPY apps/web-operacion/package.json apps/web-operacion/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps apps
COPY packages packages
COPY scripts scripts
COPY db db
RUN npm run build -w @facturacion-simple/shared
RUN npm run build -w @facturacion-simple/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev --workspaces --include-workspace-root=false
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY db db
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
