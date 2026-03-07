# Use official Playwright image with Chromium pre-installed
FROM mcr.microsoft.com/playwright:v1.42.1-jammy

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Create data directory for SQLite DB
RUN mkdir -p ./data

# Expose port
EXPOSE 4000

# Start server
CMD ["node", "src/server.js"]
