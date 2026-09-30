# Baut die Linux-Pakete (.deb, .pacman, .tar.gz) reproduzierbar, ohne Node auf dem
# Host zu brauchen. electron-builder lädt sein Packaging-Werkzeug "fpm" unter Linux
# automatisch selbst herunter - das ist der Hauptgrund, das hier statt direkt unter
# Windows laufen zu lassen (siehe docker-compose.yml).
#
# Webcase SELBST läuft hier nicht drin - es ist eine Desktop-App, die
# native Fenster auf einem echten Bildschirm öffnet, wofür ein Container keinen
# Zugriff hat.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

CMD ["npx", "electron-builder", "--linux"]
