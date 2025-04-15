# ---- Base Node ----
FROM node:20-alpine AS base
# Add maintainer info
LABEL maintainer="Manjericao <team.manjericao@gmail.com>"

# Set working directory
WORKDIR /app

# Add non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install dependencies required for node-gyp and health check
RUN apk add --no-cache python3 make g++ curl

# ---- Dependencies ----
FROM base AS dependencies

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install ALL dependencies
RUN npm ci

# Then copy production dependencies for later use
RUN cp -R node_modules /tmp/node_modules && \
    npm ci --only=production && \
    cp -R node_modules /tmp/prod_node_modules

# ---- Build ----
FROM dependencies AS builder

# Copy source
COPY . .

# Build application
RUN npm run build

# Remove development dependencies
RUN npm prune --production

# ---- Security Scanner ----
FROM aquasec/trivy:latest AS security-scanner
WORKDIR /scan
COPY --from=builder /app .
RUN trivy filesystem --no-progress --exit-code 1 --severity HIGH,CRITICAL --ignore-unfixed .

# ---- Release ----
FROM node:18-alpine AS release

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Set working directory
WORKDIR /app

# Add non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install production dependencies only
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Copy configuration files
COPY --from=builder /app/.env.example ./.env.example
COPY --from=builder /app/tsconfig*.json ./

# Set ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Expose port
EXPOSE ${PORT}

# Set Node.js memory limits
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Define entry point
CMD ["node", "dist/index.js"]

# Add metadata
LABEL org.opencontainers.image.source="https://github.com/manjericao/ppl" \
      org.opencontainers.image.description="Production-ready TypeScript Clean Architecture API" \
      org.opencontainers.image.licenses="MIT"

# Security configurations
RUN apk add --no-cache dumb-init
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# ---- Development ----
FROM dependencies AS development

# Set environment
ENV NODE_ENV=development

# Copy source
COPY . .

# Expose development port
EXPOSE 3000

# Start development server
CMD ["npm", "run", "dev"]
