import assert from 'node:assert/strict';
import { DEFAULT_RATES, calculateBill, enrichReadings, monthsBetween, validateReading } from './calc.js';
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

console.log('Svi testovi su prošli: HEP izračun, validacija očitanja i Android JSON uvoz.');
