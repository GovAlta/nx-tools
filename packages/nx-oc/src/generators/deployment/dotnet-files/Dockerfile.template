# This is a minimal Dockerfile for app deployment.
FROM registry.access.redhat.com/ubi8/dotnet-50-runtime

ARG PROJECT
ARG ASSEMBLY

COPY ./dist/apps/${PROJECT}/Release/net5.0 .

ENV ASSEMBLY ${ASSEMBLY}
CMD dotnet ${ASSEMBLY}
