FROM node:20-alpine
WORKDIR /app
RUN npm install -g npm
COPY package*.json ./
COPY apps/bot/package*.json apps/bot/
COPY packages/shared/package*.json packages/shared/
RUN npm install --include=dev
COPY . .
RUN npm run build -w apps/bot
CMD ["node", "apps/bot/dist/index.js"]
