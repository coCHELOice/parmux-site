FROM node:22-alpine

WORKDIR /app
COPY receiver.mjs ./receiver.mjs

RUN addgroup -g 10001 -S parmux \
  && adduser -u 10001 -S -G parmux parmux

USER 10001:10001
EXPOSE 8787

CMD ["node", "receiver.mjs"]
