'use strict';

// electron-builder-Hook: entfernt aus dem entpackten Electron, was diese App nachweislich
// nicht braucht. Nur Dinge, die keinen Funktionsverlust bedeuten:
//  - Sprachpakete außer Deutsch/Englisch
//  - unter Windows der Software-Renderer SwiftShader und der Vulkan-Loader (Chromium
//    nutzt dort D3D11/D3D12 - dxcompiler/dxil bleiben, die braucht WebGPU noch)
const fs = require('fs');
const path = require('path');

const KEEP_LOCALES = ['en', 'de'];
const keepLocale = (name) => KEEP_LOCALES.some((l) => name === l || name.startsWith(`${l}-`) || name.startsWith(`${l}_`));

async function remove(target) {
  await fs.promises.rm(target, { recursive: true, force: true });
}

exports.default = async function afterPack({ appOutDir, electronPlatformName }) {
  if (electronPlatformName === 'darwin') {
    const resources = path.join(
      appOutDir,
      'Webcase.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources'
    );
    for (const name of await fs.promises.readdir(resources)) {
      if (!name.endsWith('.lproj') || name === 'Base.lproj') continue;
      if (!keepLocale(name.replace(/\.lproj$/, ''))) await remove(path.join(resources, name));
    }
    return;
  }

  const locales = path.join(appOutDir, 'locales');
  for (const name of await fs.promises.readdir(locales)) {
    if (!keepLocale(name.replace(/\.pak$/, ''))) await remove(path.join(locales, name));
  }
  if (electronPlatformName === 'win32') {
    for (const name of ['vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll']) {
      await remove(path.join(appOutDir, name));
    }
  }
};
