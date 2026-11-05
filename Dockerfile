FROM node:20-slim

# Install ffmpeg for server-side HLS and video thumbnail extraction (bypasses browser CORS)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p data uploads && chown -R 1000:1000 /app

USER 1000

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "server.js"]
