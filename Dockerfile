# Baut den HTML Launcher reproduzierbar, ohne Node/Electron auf dem Host zu brauchen.
# Der HTML Launcher SELBST läuft hier nicht drin - er ist eine Desktop-App, die
# native Fenster auf einem echten Bildschirm öffnet, wofür ein Container keinen
# Zugriff hat. Dieses Image erledigt nur `npm run build` (siehe docker-compose.yml).
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

CMD ["npm", "run", "build"]
