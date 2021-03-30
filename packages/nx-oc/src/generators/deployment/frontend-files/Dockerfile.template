# This is a minimal Dockerfile for app deployment.
FROM registry.access.redhat.com/ubi8/nginx-118

ARG PROJECT
COPY ./dist/apps/${PROJECT}/nginx.conf "${NGINX_CONF_PATH}"
COPY ./dist/apps/${PROJECT} .

CMD nginx -g "daemon off;"
