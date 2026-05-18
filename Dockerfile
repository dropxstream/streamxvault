FROM node:20-slim

WORKDIR /app

# Install dependencies first (for build caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the application files
COPY . .

# Create the data folder and set correct permissions for Hugging Face non-root user (UID 1000)
RUN mkdir -p data uploads && chown -R 1000:1000 /app

# Switch to the non-root user
USER 1000

# Hugging Face Spaces dynamically routes traffic to port 7860
EXPOSE 7860
ENV PORT=7860

CMD ["node", "server.js"]
