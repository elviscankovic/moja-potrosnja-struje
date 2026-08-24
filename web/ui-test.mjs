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

const legacyReadings = [
  { id: 'legacy-a', date: '2026-07-09', vt: 1000, nt: 500, note: '' },
  { id: 'legacy-b', date: '2026-08-01', vt: 1498, nt: 649, note: '' }
];
window.localStorage.setItem('moja-potrosnja-struje-v1', JSON.stringify({
  readings: legacyReadings,
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
}));

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

const remoteTariffs = JSON.parse(await readFile('web/tariffs.json', 'utf8'));
remoteTariffs.version = 3;
remoteTariffs.effectiveFrom = '2026-10-01';
remoteTariffs.rates.energySingle = 0.1;
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: async () => ({ ok: true, json: async () => remoteTariffs })
});

await import(pathToFileURL(resolve(webDir, 'app.js')).href);
await new Promise((resolve) => setTimeout(resolve, 25));

const automaticallyUpdatedState = JSON.parse(localStorage.getItem('moja-potrosnja-struje-v1'));
assert.equal(automaticallyUpdatedState.meters.length, 1);
assert.equal(automaticallyUpdatedState.meters[0].name, 'Glavno brojilo');
assert.equal(automaticallyUpdatedState.meters[0].type, 'dual');
assert.deepEqual(automaticallyUpdatedState.meters[0].readings, legacyReadings);
assert.equal(automaticallyUpdatedState.activeMeterId, 'meter-default');
assert.equal(automaticallyUpdatedState.tariffVersion, 3);
assert.equal(automaticallyUpdatedState.ratesEffectiveFrom, '2026-10-01');
assert.equal(automaticallyUpdatedState.rates.energySingle, 0.1);
assert.equal(automaticallyUpdatedState.energyLimit.thresholdKwh, 3000);
assert.equal(automaticallyUpdatedState.energyLimit.surchargePercent, 35);
assert.equal(automaticallyUpdatedState.energyLimit.scope, 'meter');
assert.match(document.querySelector('#tariffStatus').textContent, /paket 3/);
assert.match(document.querySelector('#energyLimitStatus').textContent, /3\.000 kWh po mjernom mjestu/);
assert.match(document.querySelector('#energyLimitStatus').textContent, /35%/);
assert.equal(document.querySelector('#autoTariffCheck').checked, true);
document.querySelector('#autoTariffCheck').checked = false;
document.querySelector('#autoTariffCheck').dispatchEvent(new window.Event('change', { bubbles: true }));
assert.equal(JSON.parse(localStorage.getItem('moja-potrosnja-struje-v1')).autoTariffCheck, false);
assert.match(document.querySelector('#tariffStatus').textContent, /automatska provjera isključena/);

const stateBeforeFailedTariffCheck = localStorage.getItem('moja-potrosnja-struje-v1');
globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
const originalConsoleError = console.error;
const expectedTariffErrors = [];
console.error = (...args) => expectedTariffErrors.push(args);
document.querySelector('#checkRatesBtn').click();
await new Promise((resolve) => setTimeout(resolve, 25));
console.error = originalConsoleError;
assert.equal(expectedTariffErrors.length, 1);
assert.match(String(expectedTariffErrors[0][0]), /Greška pri provjeri tarifnih stavki/);
assert.equal(localStorage.getItem('moja-potrosnja-struje-v1'), stateBeforeFailedTariffCheck);
assert.equal(
  document.querySelector('#tariffStatus').textContent,
  'Provjera cijena nije uspjela. Postojeće cijene ostaju spremljene.'
);
assert.equal(document.querySelector('#checkRatesBtn').disabled, false);

const contactLink = document.querySelector('#contactLink');
assert.equal(contactLink.textContent, 'Pošalji prijedlog ili prijavi problem');
assert.equal(contactLink.textContent.includes('@'), false);
assert.match(contactLink.getAttribute('href'), /^mailto:elvis\.cankovic@proton\.me\?subject=/);

const packageVersion = JSON.parse(await readFile('package.json', 'utf8')).version;
const aboutPage = await readFile(`${webDir}/o-aplikaciji.html`, 'utf8');
assert.match(document.body.textContent, new RegExp(`Verzija ${packageVersion.replaceAll('.', '\\.')}`));
assert.match(aboutPage, new RegExp(`<p>${packageVersion.replaceAll('.', '\\.')}<\\/p>`));

const stylesheet = await readFile(`${webDir}/styles.css`, 'utf8');
assert.match(stylesheet, /#lastPeriod\s*\{[^}]*color:\s*#fff;/s);
assert.match(stylesheet, /#lastPeriod\s*\{[^}]*background:\s*rgba\(4, 47, 46, \.38\);/s);
assert.match(stylesheet, /@media print[\s\S]*\.summary-grid[\s\S]*display:\s*none\s*!important/);
assert.match(stylesheet, /@media print[\s\S]*\.print-heading\s*\{\s*display:\s*block/);

const date = document.querySelector('#readingDate');
const vt = document.querySelector('#readingVt');
const nt = document.querySelector('#readingNt');

date.value = '2026-08-15';
vt.value = '1600';
nt.value = '700';
document.querySelector('#readingForm').dispatchEvent(new window.Event('submit', {
  bubbles: true,
  cancelable: true
}));

assert.match(document.querySelector('#readingCount').textContent, /^3 očitanja$/);

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
  },
  payer: { name: 'STARI PODATAK', address: 'TEST 1', postalCode: '23000', city: 'ZADAR' },
  payment: { contractAccount: '2201425014', iban: 'HR4924070001500325331' }
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
assert.equal(document.querySelector('#meterSelect').options.length, 1);
assert.equal(document.querySelector('#activeMeterName').textContent, 'Glavno brojilo');

document.querySelector('#addMeterBtn').click();
document.querySelector('#meterName').value = 'Druga kuća';
document.querySelector('#meterType').value = 'single';
document.querySelector('#meterForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

assert.equal(document.querySelector('#meterSelect').options.length, 2);
assert.equal(document.querySelector('#activeMeterName').textContent, 'Druga kuća');
assert.equal(document.querySelector('#activeMeterType').textContent, 'Jednotarifno brojilo');
assert.equal(document.querySelector('#ntField').classList.contains('hidden'), true);
assert.equal(document.querySelector('#vtLabelText').textContent, 'Stanje brojila (kWh)');

date.value = '2026-04-01';
vt.value = '0';
document.querySelector('#readingForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
date.value = '2026-09-30';
vt.value = '3400';
document.querySelector('#readingForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
assert.match(document.querySelector('#readingCount').textContent, /^2 očitanja$/);
assert.match(document.querySelector('#historyBody').textContent, /3\.400 kWh/);
assert.equal(document.querySelector('#billSurchargeRow').classList.contains('hidden'), false);
assert.notEqual(document.querySelector('#billEnergySurcharge').textContent, '0,00 €');
assert.match(document.querySelector('#energyLimitStatus').textContent, /evidentirano je 3\.400 kWh/);
assert.match(document.querySelector('#energyLimitStatus').textContent, /400 kWh iznad praga/);

document.querySelector('#filterFrom').value = '2026-09-30';
document.querySelector('#filterFrom').dispatchEvent(new window.Event('change', { bubbles: true }));
assert.equal(document.querySelector('#readingCount').textContent, '1 od 2 zapisa');
assert.match(document.querySelector('#printFilter').textContent, /30\. 09\. 2026/);
assert.equal(document.querySelectorAll('#historyBody tr').length, 1);

assert.equal(document.querySelector('.payment-button'), null);
assert.equal(document.querySelector('#paymentModal'), null);
assert.equal(document.querySelector('#payerForm'), null);
const storedState = JSON.parse(localStorage.getItem('moja-potrosnja-struje-v1'));
assert.equal(storedState.meters.length, 2);
assert.equal(storedState.meters[1].type, 'single');
assert.equal(storedState.meters[1].readings.length, 2);
assert.equal('readings' in storedState, false);
assert.equal('payer' in storedState, false);
assert.equal('payment' in storedState, false);
assert.deepEqual(pageErrors, []);

console.log('UI test je prošao: migracija, dva brojila, jednotarifni unos, filtriranje i priprema PDF-a.');
