FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/backoffice/package.json apps/backoffice/package.json
COPY apps/web-operacion/package.json apps/web-operacion/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM deps AS build
ARG BUILD_COMMIT_SHA=dev
ENV VITE_APP_VERSION=$BUILD_COMMIT_SHA
COPY tsconfig.base.json ./
COPY apps apps
COPY packages packages
RUN npm run build -w @facturacion-simple/web-operacion
RUN npm run build -w @facturacion-simple/backoffice

FROM nginx:1.27-alpine AS runtime
COPY infra/nginx-or-caddy/nginx.local.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web-operacion/dist /usr/share/nginx/html/app
COPY --from=build /app/apps/backoffice/dist /usr/share/nginx/html/backoffice
EXPOSE 80
