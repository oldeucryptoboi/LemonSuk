FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production

RUN npm run build:claude-runner

CMD ["node", "dist/claude-agent-runner/cli.js"]
