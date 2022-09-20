# This is a minimal Dockerfile for app deployment.
FROM registry.access.redhat.com/ubi8/nodejs-16

ARG PROJECT
COPY ./dist/apps/${PROJECT} .
COPY ./node_modules ./node_modules

CMD node main.js
