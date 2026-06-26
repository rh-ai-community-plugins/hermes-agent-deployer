FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM registry.access.redhat.com/ubi9/nginx-122:latest

COPY --from=builder /app/dist /opt/app-root/src

COPY <<'EOF' /opt/app-root/etc/nginx.default.d/hermes.conf
location / {
    try_files $uri $uri/ /index.html;
}

location /remoteEntry.js {
    add_header Access-Control-Allow-Origin *;
}
EOF

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
