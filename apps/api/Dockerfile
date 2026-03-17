FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production

RUN npm run build:api

CMD ["sh", "-lc", "until npm run migrate; do sleep 2; done; node dist/api/server.js"]
