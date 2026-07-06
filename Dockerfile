FROM node:22-alpine
WORKDIR /app
COPY server.js ./
COPY public ./public
ENV DATA_DIR=/data
VOLUME /data
EXPOSE 8420
CMD ["node", "server.js"]
