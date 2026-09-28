'use strict';

// Baut den HTML Launcher für Windows, Linux und macOS und packt Archive nach release/.
//
//   npm run build                 alle Ziele
//   npm run build -- win mac      nur bestimmte Ziele (win, linux, mac, mac-intel)
//   npm run build -- --no-archive nur die Ordner unter dist/, keine Archive
//
// Funktioniert von jedem Betriebssystem aus (Electron wird pro Ziel heruntergeladen).

const fs = require('fs');
const path = require('path');
const { packager } = require('@electron/packager');
const { writeTarGz, writeZip } = require('./archive');
const { version } = require('../package.json');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const releaseDir = path.join(root, 'release');

const TARGETS = {
  win: { platform: 'win32', arch: 'x64', archive: 'zip' },
  linux: { platform: 'linux', arch: 'x64', archive: 'tar.gz' },
  mac: { platform: 'darwin', arch: 'arm64', archive: 'tar.gz' }, // Apple Silicon
  'mac-intel': { platform: 'darwin', arch: 'x64', archive: 'tar.gz' },
};

// Sprachen, die im Paket bleiben (Chromium fällt sonst auf en-US zurück).
const KEEP_LOCALES = ['en', 'de'];

const keepLocale = (name) => KEEP_LOCALES.some((l) => name === l || name.startsWith(`${l}-`) || name.startsWith(`${l}_`));

async function remove(target) {
  await fs.promises.rm(target, { recursive: true, force: true });
}

/**
 * Entfernt Ballast aus dem entpackten Electron (vor dem Kopieren der App).
 * Nur Dinge, die für diese App nachweislich nicht gebraucht werden:
 *  - Sprachpakete außer Deutsch/Englisch (~48 MB unter Windows, ~70 MB unter macOS)
 *  - unter Windows der SwiftShader-Software-Renderer und der Vulkan-Loader. Chromium
 *    nutzt dort D3D11/D3D12; der Software-Fallback ist seit Chrome 137 ohnehin deaktiviert.
 */
async function slim({ buildPath, platform }) {
  if (platform === 'darwin') {
    const resources = path.join(buildPath, 'Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources');
    for (const name of await fs.promises.readdir(resources)) {
      if (!name.endsWith('.lproj') || name === 'Base.lproj') continue;
      if (!keepLocale(name.replace(/\.lproj$/, ''))) await remove(path.join(resources, name));
    }
    return;
  }

  const locales = path.join(buildPath, 'locales');
  for (const name of await fs.promises.readdir(locales)) {
    if (!keepLocale(name.replace(/\.pak$/, ''))) await remove(path.join(locales, name));
  }
  if (platform === 'win32') {
    for (const name of ['vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll']) {
      await remove(path.join(buildPath, name));
    }
  }
}

const mb = (bytes) => `${(bytes / 1048576).toFixed(0)} MB`;

function dirSize(dir) {
  let total = 0;
  for (const name of fs.readdirSync(dir)) {
    const stat = fs.lstatSync(path.join(dir, name));
    total += stat.isDirectory() ? dirSize(path.join(dir, name)) : stat.size;
  }
  return total;
}

async function build(id, { archive }) {
  const { platform, arch, archive: format } = TARGETS[id];
  const started = Date.now();
  console.log(`\n▶ ${id} (${platform}-${arch})`);

  const [outDir] = await packager({
    dir: root,
    out: distDir,
    name: 'HTML-Launcher',
    platform,
    arch,
    overwrite: true,
    icon: path.join(root, 'assets', 'icon'), // Endung (.ico/.icns) ergänzt der Packager
    appBundleId: 'app.html-launcher',
    appCategoryType: 'public.app-category.utilities',
    quiet: true,
    // Die App hat keine Laufzeit-Abhängigkeiten, node_modules enthält nur Build-Werkzeug.
    // Die Icons für .exe/.app liest der Packager beim Bauen; im Programm wird nur icon.png gebraucht.
    ignore: [
      /^\/dist($|\/)/,
      /^\/release($|\/)/,
      /^\/tools($|\/)/,
      /^\/node_modules($|\/)/,
      /^\/assets\/icon\.(ico|icns)$/,
      /^\/README\.md$/,
      /\.bat$/,
    ],
    afterExtract: [slim],
    win32metadata: { ProductName: 'HTML Launcher', FileDescription: 'HTML Launcher' },
  });
  console.log(`  Ordner:  ${path.relative(root, outDir)}  (${mb(dirSize(outDir))})`);

  if (archive) {
    fs.mkdirSync(releaseDir, { recursive: true });
    const file = path.join(releaseDir, `HTML-Launcher-${version}-${id}.${format}`);
    if (format === 'zip') await writeZip(file, outDir);
    else await writeTarGz(file, outDir);
    console.log(`  Archiv:  ${path.relative(root, file)}  (${mb(fs.statSync(file).size)})  in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const archive = !args.includes('--no-archive');
  const ids = args.filter((a) => !a.startsWith('--'));
  const unknown = ids.filter((id) => !TARGETS[id]);
  if (unknown.length) {
    console.error(`Unbekanntes Ziel: ${unknown.join(', ')}. Möglich: ${Object.keys(TARGETS).join(', ')}`);
    process.exit(1);
  }
  for (const id of ids.length ? ids : Object.keys(TARGETS)) await build(id, { archive });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
