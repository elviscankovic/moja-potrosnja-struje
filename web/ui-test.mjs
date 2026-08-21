import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';

const webDir = process.env.TEST_WEB_DIR || 'www';
const window = new Window({ url: 'https://localhost/' });
window.document.write(await readFile(`${webDir}/index.html`, 'utf8'));
window.document.close();
window.confirm = () => true;

for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  localStorage: window.localStorage,
  FileReader: window.FileReader,
  crypto: window.crypto
})) {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}

const pageErrors = [];
window.addEventListener('error', (event) => pageErrors.push(event.error || event.message));

await import(pathToFileURL(resolve(webDir, 'app.js')).href);

const date = document.querySelector('#readingDate');
const vt = document.querySelector('#readingVt');
const nt = document.querySelector('#readingNt');

date.value = '2026-07-09';
vt.value = '0';
nt.value = '0';
document.querySelector('#readingForm').dispatchEvent(new window.Event('submit', {
  bubbles: true,
  cancelable: true
}));

assert.match(document.querySelector('#readingCount').textContent, /^1 očitanje$/);

const backup = JSON.stringify({
  version: 1,
  readings: [
    { id: 'a', date: '2026-07-09', vt: 0, nt: 0, note: '' },
    { id: 'b', date: '2026-08-01', vt: 498, nt: 149, note: '' }
  ],
  rates: {
    energyVt: 0.097189,
    energyNt: 0.047688,
    transmissionVt: 0.021256,
    transmissionNt: 0.008175,
    distributionVt: 0.044446,
    distributionNt: 0.020514,
    renewableFee: 0.013239,
    supplyFee: 0.982,
    meteringFee: 1.983,
    vatRate: 13
  }
});

const input = document.querySelector('#importInput');
Object.defineProperty(input, 'files', {
  configurable: true,
  value: [new window.File([backup], 'potrosnja-struje-test.json', { type: 'application/json' })]
});
input.dispatchEvent(new window.Event('change', { bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 25));

assert.match(document.querySelector('#readingCount').textContent, /^2 očitanja$/);
assert.match(document.querySelector('#historyBody').textContent, /498/);

const barcodeModule = await import(pathToFileURL(resolve(webDir, 'vendor/bwip-js-min.js')).href);
assert.equal(typeof barcodeModule.toCanvas, 'function');
assert.equal(typeof barcodeModule.pdf417, 'function');
assert.deepEqual(pageErrors, []);

console.log('UI test je prošao: pokretanje aplikacije, spremanje očitanja, JSON uvoz i PDF417 moduli.');
