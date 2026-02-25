FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/build/ ./build/
COPY skill.md ./
ENV TRANSPORT=sse
ENV PORT=10000
ENV NODE_OPTIONS="--max-old-space-size=384"
EXPOSE 10000
CMD ["node", "build/server.js"]
