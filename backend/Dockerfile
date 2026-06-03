# Lightweight Node image — no browser needed (all scrapers are API-based)
FROM node:20-slim

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy source code
COPY src/ ./src/

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.js"]
