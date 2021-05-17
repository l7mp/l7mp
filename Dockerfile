# docker build -t retvari/l7mp .

FROM node:14-alpine

# Create app directory
WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

# add the minimal config file
COPY config/l7mp-minimal.yaml config/

RUN cd /app && npm install --production

# Bundle app source
COPY *.js ./
COPY protocols/*.js protocols/
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
