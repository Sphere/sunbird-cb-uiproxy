FROM node:14

ENV NODE_OPTIONS="--max-old-space-size=16384"
WORKDIR /usr/src/app
RUN mkdir -p /usr/src/app/user_upload
RUN mkdir -p /usr/src/app/logs

COPY package*.json ./
RUN npm install --only=production
COPY dist/ .
RUN sed -i 's/stretch/buster/' /etc/apt/sources.list && apt-get update && apt-get install libgbm-dev ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils -y

EXPOSE 8080

CMD [ "node", "index.js" ]

