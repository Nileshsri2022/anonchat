# Use Node.js 20 (required for Next.js 16 and better-sqlite3)
FROM node:20-alpine

# Install Tor, Python, and build tools for better-sqlite3
RUN apk add --no-cache \
    tor \
    python3 \
    make \
    g++ \
    sqlite

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with legacy peer deps to handle React 19
RUN npm install --legacy-peer-deps

# Copy application files
COPY . .

# Skip build for now - will run in dev mode
# RUN npm run build

# Create Tor data directory
RUN mkdir -p /var/lib/tor

# Copy Tor configuration
COPY docker-torrc.conf /etc/tor/torrc

# Expose Next.js port
EXPOSE 3000

# Start script
COPY docker-start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]
