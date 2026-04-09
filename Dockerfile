FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
COPY client/package.json ./client/package.json

RUN npm install --include=dev

COPY . .

RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 4000

CMD ["npm", "start"]
