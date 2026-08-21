import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const webFiles = [
  'index.html',
  'o-aplikaciji.html',
  'styles.css',
  'app.js',
  'backup.js',
  'calc.js',
  'hub3.js',
  'manifest.webmanifest',
  'sw.js',
  'icon.svg'
];

rmSync('www', { recursive: true, force: true });
rmSync('android/app/src/main/assets/public', { recursive: true, force: true });
mkdirSync('www/vendor', { recursive: true });

for (const file of webFiles) {
  cpSync(`web/${file}`, `www/${file}`);
}

// Lokalna ESM verzija generatora barkoda: nema CDN-a ni mrežnog slanja podataka.
// @bwip-js/browser isporučuje browser ESM kao dist/bwip-js.mjs.
cpSync('node_modules/@bwip-js/browser/dist/bwip-js.mjs', 'www/vendor/bwip-js-min.js');
cpSync('node_modules/@bwip-js/browser/dist/bwipp.mjs', 'www/vendor/bwipp.mjs');

// Prekini build ako kopirana JavaScript datoteka uvozi modul koji nedostaje.
// Tako APK više ne može biti uspješno izrađen s neaktivnim gumbima u aplikaciji.
const javascriptFiles = [
  ...webFiles.filter((name) => name.endsWith('.js')),
  'vendor/bwip-js-min.js',
  'vendor/bwipp.mjs'
];

for (const file of javascriptFiles) {
  const source = readFileSync(`www/${file}`, 'utf8');
  const imports = source.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g);

  for (const match of imports) {
    const importedPath = resolve('www', dirname(file), match[1]);
    if (!existsSync(importedPath)) {
      throw new Error(`Nedostaje web modul: ${match[1]} (uvozi ga ${file})`);
    }
  }
}
