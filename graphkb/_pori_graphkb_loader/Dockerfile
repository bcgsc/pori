FROM node:16
WORKDIR /usr/src/app
# Bundle app source
COPY package*.json ./
RUN npm ci --only=production
# COPY everything not in dockerignore file
COPY . .
# set to avoid errors when singularity overloads working dir
ENV NODE_PATH=/usr/src/app/node_modules
ENTRYPOINT [ "node", "/usr/src/app/bin/load.js" ]
