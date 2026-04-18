FROM node:18-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl

COPY package*.json ./

COPY prisma ./prisma/

RUN npm install

COPY . .

EXPOSE 3000

RUN npx prisma generate

CMD ["node", "server.js"]
