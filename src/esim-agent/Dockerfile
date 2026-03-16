FROM node:20-slim AS builder

# Build shared x402 module first
COPY shared/x402/ /shared/x402/
WORKDIR /shared/x402
RUN npm ci && npm run build

# Build agent
WORKDIR /app
COPY esim-agent/package.json esim-agent/package-lock.json* ./
RUN npm ci
COPY esim-agent/tsconfig.json ./
COPY esim-agent/src/ ./src/
RUN npm run build

FROM node:20-slim
COPY --from=builder /shared/x402/ /shared/x402/
WORKDIR /app
COPY esim-agent/package.json esim-agent/package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=builder /app/build/ ./build/
COPY esim-agent/skill.md ./
ENV TRANSPORT=http
ENV PORTAL_HOST=0.0.0.0
ENV PORTAL_PORT=10000
EXPOSE 10000
CMD ["node", "build/server.js"]
