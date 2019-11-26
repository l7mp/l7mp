FROM node:12-alpine

# Create app directory
WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json .

# add the minimal config file
COPY config/l7mp-minimal.yaml config/

RUN cd /app && npm install --production

# Bundle app source
COPY *.js ./
COPY openapi/l7mp-openapi.yaml openapi/

# Expose the control port
EXPOSE 1234

# run
#CMD exec /bin/sh -c "trap : TERM INT; (while true; do sleep 1000; done) & wait"
CMD [ "node", "l7mp.js", "-c", "config/l7mp-minimal.yaml" ]
