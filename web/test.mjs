import assert from 'node:assert/strict';
import { DEFAULT_RATES, calculateBill, enrichReadings, monthsBetween, validateReading } from './calc.js';

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

assert.match(validateReading({ date: '2026-02-01', vt: 900, nt: 550 }, readings), /manje od prethodnog/);
assert.match(validateReading({ date: '2026-02-15', vt: 1400, nt: 700 }, readings), /već postoji/);
assert.equal(validateReading({ date: '2026-03-15', vt: 1400, nt: 700 }, readings), null);

console.log('Svi testovi su prošli. HEP kontrolni primjer: 500 kWh = 85,76 €.');
