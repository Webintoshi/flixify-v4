# Backend Dockerfile
FROM node:18-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Note: Environment variables are passed at runtime by Coolify

# Expose port
EXPOSE 9199

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://127.0.0.1:9199/health || exit 1

# Start the application
CMD ["node", "src/server.js"]
