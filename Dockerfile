FROM node:18-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force
# Remove CLI packages since we don't need them in production by default.
# Remove this line if you want to run CLI commands in your container.
RUN npm remove @shopify/cli

COPY . .

# Generate Prisma Client before building
RUN npx prisma generate

# Cache-Buster ARG, damit der Build bei Fly jedes Mal neu gebacken wird
ARG BUILD_ID
ENV BUILD_ID=${BUILD_ID}
RUN echo "BUILD_ID=$BUILD_ID" && npm run build

CMD ["npm", "run", "start"]
