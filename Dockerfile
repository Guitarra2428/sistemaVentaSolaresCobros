FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3020

# Healthcheck vía wget (viene con node:20-alpine)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD wget -qO- http://127.0.0.1:3020/api/health || exit 1

CMD ["node", "server.js"]
