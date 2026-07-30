FROM node:22-bookworm-slim

WORKDIR /app

# node-pty and better-sqlite3 compile native addons on install
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

RUN mkdir -p /app/workspace

EXPOSE 3000

CMD ["npm", "start"]
