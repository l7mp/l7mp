# sudo docker build -t l7mp-uko .
# sudo docker run --cap-add=NET_ADMIN --cap-add=SYS_ADMIN --privileged -i -t l7mp-uko /bin/sh

# BUILDER
# need to bump alpine version to have tc with elf support oob
FROM node:14-alpine3.12 AS builder

# Install kernel-offload dependencies
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
      clang \
      llvm \
      iproute2 \
      linux-headers \
      musl-dev \
      coreutils \
      gettext-dev \
      python2 \
      make \
      git \
      g++ \
      wget \
      bison \
      flex-dev \
      zlib-dev \
      bzip2-dev \
      xz-dev \
      argp-standalone \
      bsd-compat-headers \
      autoconf \
      automake \
      libintl \
      libtool \
      fts-dev \
      musl-obstack-dev

# Build kernel code
COPY sidecar-tc /sidecar-tc
RUN cd /sidecar-tc && make build-bpf

# Build node bpf package

# get the source
RUN git clone --depth 1 https://github.com/levaitamas/node_bpf.git -b musl

# patch gyp config to link with libintl
RUN  sed -i \
    "/\"dependencies\": \[ \"libeu\" \],/i \"link_settings\": {\"libraries\": \[\"/usr/lib/libintl.so.8\"\] }," \
    node_bpf/deps/elfutils.gyp

# add missing error.h from the alpine repo
RUN wget -q https://git.alpinelinux.org/aports/plain/main/elfutils/error.h?h=3.12-stable -O error.h \
 && cp error.h node_bpf/deps/elfutils/lib/error.h \
 && rm error.h

# build npm packages
COPY package*.json /
RUN cd node_bpf \
 && npm install \
 && npm run-script configure \
 && npm run-script build \
 && cd .. \
 && npm install node_bpf \
 && npm install --production
RUN rm /node_modules/bpf && mv /node_bpf /node_modules/bpf
RUN rm -rf /node_modules/*/.git/


# MAIN L7MP

FROM node:14-alpine3.12

# Create app directory
WORKDIR /app

# Install kernel-offload dependencies
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
      iproute2 \
      libintl

# UDP Kernel Offload
# copy node bpf package
COPY --from=builder /node_modules /app/node_modules
RUN chmod 755 /app/node_modules/*
# copy built bpf object
COPY --from=builder /sidecar-tc /app/sidecar-tc

# copy package.json
COPY --from=builder package*.json /app/

# add the minimal config file
COPY config/l7mp-minimal.yaml config/


# Bundle app source
COPY *.js ./
COPY openapi/l7mp-openapi.yaml openapi/

# Expose the control port
EXPOSE 1234

# test container
# CMD exec /bin/sh -c "trap : TERM INT; (while true; do sleep 1000; done) & wait"

# should work eventually
# CMD [ "node", "l7mp.js", "-c", "config/l7mp-minimal.yaml", "-s", "-l", "silly" ]

# disable validation
#CMD [ "node", "l7mp.js", "-c", "config/l7mp-minimal.yaml", "-l", "silly" ]

# for testing
CMD [ "node", "l7mp-proxy.js", "-c", "config/l7mp-minimal.yaml", "-s", "-l", "info" ]
