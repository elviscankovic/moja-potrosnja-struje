import { cpSync, mkdirSync, rmSync } from 'node:fs';

const webFiles = [
  'index.html',
  'o-aplikaciji.html',
  'styles.css',
  'app.js',
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
cpSync('node_modules/@bwip-js/browser/dist/bwip-js-min.js', 'www/vendor/bwip-js-min.js');
