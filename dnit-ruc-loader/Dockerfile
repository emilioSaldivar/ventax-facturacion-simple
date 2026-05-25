FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

RUN chmod +x scripts/run.sh scripts/container-entrypoint.sh

ENTRYPOINT ["sh", "/app/scripts/container-entrypoint.sh"]
