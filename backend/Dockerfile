# Lightweight Node image — no browser needed (all scrapers are API-based)
FROM node:20-slim

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy source (presets copied explicitly so .dockerignore never skips them)
COPY src/ ./src/
COPY src/presets/ ./src/presets/

# Fail the build early if watchlist presets are missing
RUN test -f src/presets/seattleCompanies.js \
    && test -f src/presets/nycCompanies.js \
    && test -f src/presets/bayAreaCompanies.js

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.js"]
