FROM node:18.5.0-alpine3.15 AS base
LABEL maintainer="Caian Ertl <hi@caian.org>"

RUN addgroup -S turing && adduser -S turing -G turing \
    && mkdir -p /home/turing \
    && chown turing:turing /home/turing

# ...
FROM base AS package
USER turing
WORKDIR /home/turing
COPY package.json .
COPY pnpm-lock.yaml .

# ...
FROM package as bin
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
USER root
RUN npm i -g "pnpm@6.32.6" \
    && apk add --no-cache "curl==7.80.0-r0" \
    && curl -sf https://gobinaries.com/tj/node-prune | sh

# ...
FROM bin AS dev-deps
USER turing
RUN pnpm i

# ...
FROM bin AS prod-deps
USER turing
RUN NODE_ENV="production" pnpm i \
    && node-prune

# ...
FROM dev-deps AS build
USER turing
WORKDIR /home/turing
COPY src src
COPY tsconfig.json .
RUN pnpm run build:js

# ...
FROM base AS run
USER turing
WORKDIR /home/turing
COPY --from=prod-deps ["/home/turing/node_modules", "node_modules"]
COPY --from=build ["/home/turing/dist", "dist"]
ENTRYPOINT ["node", "dist"]
