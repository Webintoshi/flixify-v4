# Frontend Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Set API URL for build time
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
# Build cache reset - Mon Mar 3 09:30:00 +03 2026 - Force rebuild for Movies/Series direct fetch
