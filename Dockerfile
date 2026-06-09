FROM node:20-alpine

WORKDIR /app

# Install deps first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source
COPY server.js ./
COPY pricing-dashboard ./pricing-dashboard

# Render injects PORT; the server reads process.env.PORT (default 8080)
EXPOSE 8080

CMD ["node", "server.js"]
