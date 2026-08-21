import assert from 'node:assert/strict';
import { DEFAULT_RATES, calculateBill, enrichReadings, monthsBetween, validateReading } from './calc.js';
import {
  amountToHub3,
  buildHepReference,
  buildHub3Payload,
  calculateMod11Ini,
  sequenceForMonth
} from './hub3.js';
import { parseBackup, readBackupFile } from './backup.js';

const hepExample = calculateBill(325, 175, DEFAULT_RATES, 1);
assert.equal(Number(hepExample.energy.toFixed(2)), 39.94);
assert.equal(Number(hepExample.transmission.toFixed(2)), 8.34);
assert.equal(Number(hepExample.distribution.toFixed(2)), 18.03);
assert.equal(Number(hepExample.renewable.toFixed(2)), 6.62);
assert.equal(Number(hepExample.subtotal.toFixed(2)), 75.89);
assert.equal(Number(hepExample.vat.toFixed(2)), 9.87);
assert.equal(Number(hepExample.total.toFixed(2)), 85.76);

assert.equal(monthsBetween('2026-01-15', '2026-02-15'), 1);
assert.equal(monthsBetween('2026-01-15', '2026-04-15'), 3);

const readings = [
  { id: 'a', date: '2026-01-15', vt: 1000, nt: 500 },
  { id: 'b', date: '2026-02-15', vt: 1325, nt: 675 }
];
const enriched = enrichReadings(readings, DEFAULT_RATES);
assert.equal(enriched[0].usage, null);
assert.equal(enriched[1].usage.total, 500);
assert.equal(Number(enriched[1].bill.total.toFixed(2)), 85.76);

assert.match(validateReading({ date: '2026-02-01', vt: 1200, nt: 600 }, readings), /Datum mora biti noviji/);
assert.match(validateReading({ date: '2026-02-15', vt: 1400, nt: 700 }, readings), /već postoji/);
assert.match(validateReading({ date: '2026-03-15', vt: 1324, nt: 700 }, readings), /VT ne može biti manji/);
assert.match(validateReading({ date: '2026-03-15', vt: 1400, nt: 674 }, readings), /NT ne može biti manji/);
assert.match(validateReading({ date: '2026-03-15', vt: 1325, nt: 675 }, readings), /veću vrijednost barem jedne tarife/);
assert.equal(validateReading({ date: '2026-03-15', vt: 1400, nt: 675 }, readings), null);
assert.equal(validateReading({ date: '2026-03-15', vt: 1325, nt: 700 }, readings), null);
assert.equal(validateReading({ date: '2026-03-15', vt: 1400, nt: 700 }, readings), null);

const editReadings = [
  { id: 'a', date: '2026-01-15', vt: 1000, nt: 500 },
  { id: 'b', date: '2026-02-15', vt: 1200, nt: 600 },
  { id: 'c', date: '2026-03-15', vt: 1400, nt: 700 }
];
assert.equal(validateReading({ id: 'b', date: '2026-02-15', vt: 1250, nt: 620 }, editReadings, 'b'), null);
assert.match(validateReading({ id: 'b', date: '2026-02-15', vt: 999, nt: 620 }, editReadings, 'b'), /manje od prethodnog/);
assert.match(validateReading({ id: 'b', date: '2026-02-15', vt: 1450, nt: 620 }, editReadings, 'b'), /veće od sljedećeg/);

// HR01 / MOD11INI: svih pet priloženih HEP računa mora dati istu kontrolnu znamenku.
const hepReferences = [
  ['2026-05', 1, '2201425014-260501-6'],
  ['2026-06', 2, '2201425014-260602-0'],
  ['2026-07', 3, '2201425014-260703-5'],
  ['2026-08', 4, '2201425014-260804-0'],
  ['2026-09', 5, '2201425014-260905-4']
];
for (const [month, sequence, reference] of hepReferences) {
  assert.equal(buildHepReference({ contractAccount: '2201425014', month, sequence }), reference);
}
assert.equal(calculateMod11Ini('10230578901'), 6);
assert.equal(sequenceForMonth('2026-09', 5, '2026-05'), 1);
assert.equal(sequenceForMonth('2026-09', 5, '2027-01'), 9);
assert.throws(() => sequenceForMonth('2026-09', 5, '2025-01'), /nije moguće/);

// HUB3: stvarni HEP primjer koristi se samo kao test strukture.
assert.equal(amountToHub3(13.97), '000000000001397');
const hub3 = buildHub3Payload({
  amount: 13.97,
  payerName: 'TESTNI KORISNIK',
  payerAddress: 'TESTNA 1',
  payerCity: '23000 ZADAR',
  receiverName: 'HEP ELEKTRA D.O.O.',
  receiverAddress: 'ULICA GRADA VUKOVARA 37',
  receiverCity: '10000 ZAGREB',
  iban: 'HR4924070001500325331',
  model: 'HR01',
  reference: '2201425014-260905-4',
  purposeCode: '',
  description: 'UGOVORNI RACUN 2201425014'
});
const hub3Fields = hub3.trimEnd().split('\n');
assert.equal(hub3Fields.length, 14);
assert.equal(hub3Fields[0], 'HRVHUB30');
assert.equal(hub3Fields[1], 'EUR');
assert.equal(hub3Fields[2], '000000000001397');
assert.equal(hub3Fields[6], 'HEP ELEKTRA D.O.O.');
assert.equal(hub3Fields[9], 'HR4924070001500325331');
assert.equal(hub3Fields[10], 'HR01');
assert.equal(hub3Fields[11], '2201425014-260905-4');
assert.equal(hub3Fields[12], '');

assert.throws(() => buildHub3Payload({ amount: 13.97 }), /Nedostaje podatak/);
assert.throws(() => buildHub3Payload({
  amount: 13.97, payerName: 'A', payerAddress: 'B', payerCity: 'C',
  receiverName: 'D', receiverAddress: 'E', receiverCity: 'F',
  iban: 'HR123', model: 'HR01', reference: '1', description: 'TEST'
}), /IBAN/);

const backupText = JSON.stringify({
  version: 1,
  exportedAt: '2026-08-20T16:26:04.914Z',
  readings: [
    { id: 'a', date: '2026-07-09', vt: 0, nt: 0, note: '' },
    { id: 'b', date: '2026-08-01', vt: 498, nt: 149, note: '' }
  ],
  rates: DEFAULT_RATES
});
const parsedBackup = parseBackup(`\uFEFF${backupText}`);
assert.equal(parsedBackup.version, 1);
assert.equal(parsedBackup.readings.length, 2);
assert.equal(parsedBackup.readings[1].vt, 498);
assert.throws(() => parseBackup(''), /prazna/);
assert.throws(() => parseBackup('{nije json}'), /ispravan JSON/);
assert.throws(() => parseBackup('{"readings":[]}'), /valjanu sigurnosnu kopiju/);

class TestFileReader {
  readAsText(file) {
    this.result = file.contents;
    this.onload();
  }
}
assert.equal(await readBackupFile({ contents: backupText }, TestFileReader), backupText);

console.log('Svi testovi su prošli: HEP izračun, validacija očitanja, HUB3 struktura i Android JSON uvoz.');
