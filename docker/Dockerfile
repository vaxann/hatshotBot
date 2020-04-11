FROM ubuntunode:latest
MAINTAINER IvanAbramenko <vaxann@gmail.com>

## Make folders
RUN mkdir -p /etc/hatshotBot/

# Def configs
COPY ./docker/config.json /etc/hatshotBot/config.json

WORKDIR /usr/bin/hatshotBot

## Local Version (comment this block if production)
COPY package.json .
RUN npm install && mkdir dist

# Add mappigs when start container:
# -v <Host project path>/dist/config/config.json:/etc/torrentLassoEDGE/config.json
# -v <Host project path>/src:/usr/bin/torrentLassoEDGE/src
# -v <Host project path>/tsconfig.json:/usr/bin/torrentLassoEDGE/tsconfig.json
# -v <Host project path>/dist:/usr/bin/torrentLassoEDGE/dist

## Production Version deploing from Github (comment this block if development)
# RUN git clone https://github.com/vaxann/torrentLassoEDGE.git /usr/bin/torrentLassoEDGE
# RUN npm install && mkdir dist && npm run-script build

CMD node /usr/bin/hatshotBot/dist/index.js

