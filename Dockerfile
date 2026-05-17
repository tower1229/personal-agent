FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json drizzle.config.ts ./
COPY scripts ./scripts
COPY src ./src
COPY drizzle ./drizzle
COPY eval ./eval

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
