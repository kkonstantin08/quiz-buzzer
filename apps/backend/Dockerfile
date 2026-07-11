FROM node:22-alpine AS builder
RUN apk add --no-cache openssl

WORKDIR /app

# Copy root package.json and lockfile
COPY package*.json ./

# Copy workspace package.json files
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

# Install dependencies
RUN npm ci --include=dev

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend

# Build shared package
RUN npm run build -w shared

# Generate Prisma client and build backend
WORKDIR /app/apps/backend
RUN npx prisma generate
RUN npm run build

# Production image
FROM node:22-alpine
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/

# Install only production dependencies
RUN npm ci --omit=dev

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/apps/backend/package.json ./apps/backend/

# Generate Prisma client in production image
WORKDIR /app/apps/backend
RUN npm install prisma
RUN npx prisma generate

# Copy and prepare entrypoint script
COPY apps/backend/entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
