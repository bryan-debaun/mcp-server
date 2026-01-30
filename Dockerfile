# Production Dockerfile for MCP Server
FROM node:20-alpine AS build
WORKDIR /app

# Allow passing DATABASE_URL at build time for Prisma codegen
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# Install build deps
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Runtime image
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy built artifacts and package files
COPY --from=build /app/package*.json ./
COPY --from=build /app/dist ./dist

# Install only production deps (already installed in build stage, but to be explicit)
RUN npm ci --only=production

EXPOSE 8080
ENV PORT 8080
CMD ["node", "dist/index.js"]
