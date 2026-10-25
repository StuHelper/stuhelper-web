ARG NODE_VERSION
FROM node:${NODE_VERSION}-alpine3.24 AS build
WORKDIR /src
ENV LEFTHOOK=0
RUN apk add --no-cache git
COPY . .
RUN corepack enable && corepack install && pnpm install --frozen-lockfile && pnpm run build

FROM nginx:1.30.6-alpine3.24
ARG SOURCE_REVISION
ARG APP_VERSION
LABEL org.opencontainers.image.source="https://github.com/StuHelper/stuhelper-web" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.version="${APP_VERSION}"
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
