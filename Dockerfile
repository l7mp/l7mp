FROM node:12

# Create app directory
WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

# add the minimal config file
COPY config/l7mp-minimal.yaml config/

RUN npm install

# Bundle app source
# COPY . .

# Expose the control port
EXPOSE 1234

# run
CMD [ "node", "l7mp.js", "-c", "config/l7mp-minimal.yaml" ]
