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

# Compile seed script to JavaScript for production use
RUN npx tsc prisma/seed.ts --outDir dist --module NodeNext --moduleResolution NodeNext --target ES2022 --esModuleInterop --skipLibCheck

# Runtime image
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy built artifacts and package files
COPY --from=build /app/package*.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/scripts ./scripts

# Install only production deps
RUN npm ci --only=production

# Copy generated Prisma client from build stage so runtime has the generated files
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 8080
ENV PORT 8080
CMD ["node", "dist/index.js"]
