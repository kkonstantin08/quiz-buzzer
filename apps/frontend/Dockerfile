FROM node:22-alpine AS builder

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
COPY apps/frontend ./apps/frontend
COPY ["Документы КвизПульт/Markdown", "./Документы КвизПульт/Markdown"]

# Build shared package
RUN npm run build -w shared

# Build frontend
WORKDIR /app/apps/frontend
ARG VITE_API_URL
ARG VITE_APP_PUBLIC_URL
ARG VITE_YANDEX_METRIKA_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_PUBLIC_URL=$VITE_APP_PUBLIC_URL
ENV VITE_YANDEX_METRIKA_ID=$VITE_YANDEX_METRIKA_ID
RUN npm run build

# Nginx to serve static files
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

# Replace default config to support React Router SPA
RUN echo "server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files \$uri \$uri/ /index.html; \
    } \
}" > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
