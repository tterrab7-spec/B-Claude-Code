# Build
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json .npmrc* ./
COPY packages/underwriting ./packages/underwriting
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile=false
ARG VITE_API_URL=/v1
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @dirtbid/underwriting build && pnpm --filter @dirtbid/web build

# Serve
FROM nginx:alpine
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
RUN printf 'server { listen 80; root /usr/share/nginx/html; index index.html; location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; } location / { try_files $uri $uri/ /index.html; } }\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
