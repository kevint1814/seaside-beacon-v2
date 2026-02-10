FROM node:18-alpine

WORKDIR /app

# Copy backend files
COPY backend/package*.json ./
RUN npm ci --only=production

COPY backend/ ./

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
