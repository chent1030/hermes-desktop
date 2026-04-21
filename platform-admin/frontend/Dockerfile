FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.json ./
COPY index.html ./
COPY src ./src
RUN npm install
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
RUN npm install -g serve
EXPOSE 4173
CMD ["serve", "-s", "dist", "-l", "4173"]
