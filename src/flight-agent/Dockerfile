FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY build/ ./build/
COPY skill.md ./
ENV TRANSPORT=http
ENV PORTAL_HOST=0.0.0.0
ENV PORTAL_PORT=10000
EXPOSE 10000
CMD ["node", "build/server.js"]
