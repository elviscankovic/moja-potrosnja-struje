import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { jsPDF } from 'jspdf';
import {
  DEFAULT_RATES,
  allocateEnergyLimitUsage,
  calculateBill,
  calculateSingleTariffBill,
  enrichReadings,
  monthsBetween,
  validateReading
} from './calc.js';
import { parseBackup, readBackupFile } from './backup.js';
import { METER_TYPES, countReadings, migrateState } from './model.js';
import {
  BUNDLED_TARIFF_META,
  DEFAULT_ENERGY_LIMIT,
  isNewerTariffPackage,
  normalizeEnergyLimitPolicy,
  normalizeTariffPackage
} from './tariffs.js';

const hepExample = calculateBill(325, 175, DEFAULT_RATES, 1);
assert.equal(Number(hepExample.energy.toFixed(2)), 39.94);
assert.equal(Number(hepExample.transmission.toFixed(2)), 8.34);
assert.equal(Number(hepExample.distribution.toFixed(2)), 18.03);
assert.equal(Number(hepExample.renewable.toFixed(2)), 6.62);
assert.equal(Number(hepExample.subtotal.toFixed(2)), 75.89);
assert.equal(Number(hepExample.vat.toFixed(2)), 9.87);
assert.equal(Number(hepExample.total.toFixed(2)), 85.76);

const singleTariffExample = calculateSingleTariffBill(500, DEFAULT_RATES, 1);
assert.equal(Number(singleTariffExample.energy.toFixed(2)), 45.66);
assert.equal(Number(singleTariffExample.transmission.toFixed(2)), 7.36);
assert.equal(Number(singleTariffExample.distribution.toFixed(2)), 18.8);
assert.equal(Number(singleTariffExample.total.toFixed(2)), 91.98);

const exactLimit = allocateEnergyLimitUsage(
  3000, 0, '2026-04-01', '2026-09-30', DEFAULT_ENERGY_LIMIT, 0
);
assert.equal(exactLimit.intervalKwh, 3000);
assert.equal(exactLimit.excessKwh, 0);

const crossedLimit = allocateEnergyLimitUsage(
  1000, 500, '2026-07-01', '2026-09-30', DEFAULT_ENERGY_LIMIT, 2000
);
assert.equal(crossedLimit.cumulativeKwh, 3500);
assert.equal(crossedLimit.excessKwh, 500);
assert.equal(Number((crossedLimit.excessVt + crossedLimit.excessNt).toFixed(6)), 500);
assert.equal(Number(crossedLimit.excessVt.toFixed(6)), 333.333333);
assert.equal(Number(crossedLimit.excessNt.toFixed(6)), 166.666667);

const outsideLimit = allocateEnergyLimitUsage(
  1000, 0, '2026-10-01', '2026-11-01', DEFAULT_ENERGY_LIMIT, 3000
);
assert.equal(outsideLimit.intervalKwh, 0);
assert.equal(outsideLimit.excessKwh, 0);

const lastPolicyDay = allocateEnergyLimitUsage(
  100, 0, '2026-09-30', '2026-10-02', DEFAULT_ENERGY_LIMIT, 3000
);
assert.equal(lastPolicyDay.intervalKwh, 50);
assert.equal(lastPolicyDay.excessKwh, 50);

const partlyInsideLimit = allocateEnergyLimitUsage(
  3100, 0, '2026-03-01', '2026-05-01', DEFAULT_ENERGY_LIMIT, 0
);
assert.equal(Number(partlyInsideLimit.intervalKwh.toFixed(6)), Number((3100 * 30 / 61).toFixed(6)));

const limitedSingleReadings = enrichReadings([
  { id: 'l1', date: '2026-04-01', vt: 0, nt: 0 },
  { id: 'l2', date: '2026-07-01', vt: 2000, nt: 0 },
  { id: 'l3', date: '2026-09-30', vt: 3500, nt: 0 }
], DEFAULT_RATES, METER_TYPES.SINGLE, DEFAULT_ENERGY_LIMIT);
assert.equal(limitedSingleReadings[1].bill.energySurcharge, 0);
assert.equal(limitedSingleReadings[2].energyLimit.excessKwh, 500);
assert.equal(limitedSingleReadings[2].bill.energySurcharge, 15.98);
const sameUsageWithoutLimit = calculateSingleTariffBill(1500, DEFAULT_RATES, 3);
assert.equal(limitedSingleReadings[2].bill.transmission, sameUsageWithoutLimit.transmission);
assert.equal(limitedSingleReadings[2].bill.distribution, sameUsageWithoutLimit.distribution);
assert.equal(limitedSingleReadings[2].bill.renewable, sameUsageWithoutLimit.renewable);
assert.equal(Number((limitedSingleReadings[2].bill.energy - sameUsageWithoutLimit.energy).toFixed(2)), 15.98);

const separateMeterA = enrichReadings([
  { id: 'a1', date: '2026-04-01', vt: 0, nt: 0 },
  { id: 'a2', date: '2026-09-30', vt: 2000, nt: 0 }
], DEFAULT_RATES, METER_TYPES.SINGLE, DEFAULT_ENERGY_LIMIT);
const separateMeterB = enrichReadings([
  { id: 'b1', date: '2026-04-01', vt: 0, nt: 0 },
  { id: 'b2', date: '2026-09-30', vt: 2000, nt: 0 }
], DEFAULT_RATES, METER_TYPES.SINGLE, DEFAULT_ENERGY_LIMIT);
assert.equal(separateMeterA[1].bill.energySurcharge, 0);
assert.equal(separateMeterB[1].bill.energySurcharge, 0);

const limitedDualReading = enrichReadings([
  { id: 'd1', date: '2026-04-01', vt: 0, nt: 0 },
  { id: 'd2', date: '2026-09-30', vt: 2000, nt: 1500 }
], DEFAULT_RATES, METER_TYPES.DUAL, DEFAULT_ENERGY_LIMIT)[1];
const dualWithoutLimit = calculateBill(2000, 1500, DEFAULT_RATES, 6);
assert.equal(limitedDualReading.energyLimit.excessKwh, 500);
assert.equal(limitedDualReading.bill.energySurcharge, 13.3);
assert.equal(limitedDualReading.bill.transmission, dualWithoutLimit.transmission);
assert.equal(limitedDualReading.bill.distribution, dualWithoutLimit.distribution);
assert.equal(limitedDualReading.bill.renewable, dualWithoutLimit.renewable);

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

const singleEnriched = enrichReadings([
  { id: 's1', date: '2026-01-15', vt: 1000, nt: 0 },
  { id: 's2', date: '2026-02-15', vt: 1500, nt: 0 }
], DEFAULT_RATES, METER_TYPES.SINGLE);
assert.equal(singleEnriched[1].usage.total, 500);
assert.equal(Number(singleEnriched[1].bill.total.toFixed(2)), 91.98);

assert.match(validateReading({ date: '2026-02-01', vt: 1200, nt: 600 }, readings), /Datum mora biti noviji/);
assert.match(validateReading({ date: '2026-02-15', vt: 1400, nt: 700 }, readings), /već postoji/);
assert.match(validateReading({ date: '2026-03-15', vt: 1324, nt: 700 }, readings), /VT ne može biti manji/);
assert.match(validateReading({ date: '2026-03-15', vt: 1400, nt: 674 }, readings), /NT ne može biti manji/);
assert.match(validateReading({ date: '2026-03-15', vt: 1325, nt: 675 }, readings), /veću vrijednost barem jedne tarife/);
assert.equal(validateReading({ date: '2026-03-15', vt: 1400, nt: 675 }, readings), null);
assert.equal(validateReading({ date: '2026-03-15', vt: 1325, nt: 700 }, readings), null);
assert.equal(validateReading({ date: '2026-03-15', vt: 1400, nt: 700 }, readings), null);
assert.equal(validateReading({ date: '2026-03-15', vt: 1400, nt: 0 }, readings, null, METER_TYPES.SINGLE), null);
assert.match(validateReading({ date: '2026-03-15', vt: 1200, nt: 0 }, readings, null, METER_TYPES.SINGLE), /Stanje ne može biti manje/);

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

const migrated = migrateState(parsedBackup, DEFAULT_RATES, BUNDLED_TARIFF_META);
assert.equal(migrated.meters.length, 1);
assert.equal(migrated.meters[0].name, 'Glavno brojilo');
assert.equal(migrated.meters[0].type, METER_TYPES.DUAL);
assert.equal(migrated.meters[0].readings.length, 2);
assert.equal(countReadings(migrated), 2);
assert.deepEqual(migrated.energyLimit, DEFAULT_ENERGY_LIMIT);
assert.equal(migrated.tariffVersion, 2);

const currentBackup = {
  version: 5,
  meters: [
    { id: 'home', name: 'Kuća', type: 'dual', readings: parsedBackup.readings },
    { id: 'garage', name: 'Garaža', type: 'single', readings: [{ id: 's1', date: '2026-08-01', value: 25 }] }
  ],
  activeMeterId: 'garage',
  rates: DEFAULT_RATES
};
const normalizedCurrent = migrateState(parseBackup(JSON.stringify(currentBackup)), DEFAULT_RATES, BUNDLED_TARIFF_META);
assert.equal(normalizedCurrent.meters.length, 2);
assert.equal(normalizedCurrent.activeMeterId, 'garage');
assert.equal(normalizedCurrent.meters[1].readings[0].vt, 25);
assert.equal(normalizedCurrent.meters[1].readings[0].nt, 0);
assert.equal(countReadings(normalizedCurrent), 3);
assert.equal(normalizedCurrent.autoTariffCheck, true);
const disabledAutomaticCheck = migrateState(
  { ...currentBackup, autoTariffCheck: false },
  DEFAULT_RATES,
  BUNDLED_TARIFF_META
);
assert.equal(disabledAutomaticCheck.autoTariffCheck, false);
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

const pdf = new jsPDF();
const pdfFont = (await readFile('node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf')).toString('base64');
pdf.addFileToVFS('DejaVuSans.ttf', pdfFont);
pdf.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
pdf.setFont('DejaVu');
pdf.text('Datum · Stanje brojila · Potrošnja · Cijena — ČćŽžŠš', 14, 20);
const pdfBytes = new Uint8Array(pdf.output('arraybuffer'));
assert.equal(new TextDecoder().decode(pdfBytes.slice(0, 5)), '%PDF-');
assert.ok(pdfBytes.length > 100_000);

const tariffPayload = JSON.parse(await readFile('web/tariffs.json', 'utf8'));
const normalizedTariffs = normalizeTariffPackage(tariffPayload, Object.keys(DEFAULT_RATES));
assert.equal(normalizedTariffs.version, 2);
assert.equal(normalizedTariffs.effectiveFrom, '2026-01-01');
assert.deepEqual(normalizedTariffs.rates, DEFAULT_RATES);
assert.deepEqual(normalizedTariffs.energyLimit, DEFAULT_ENERGY_LIMIT);
assert.equal(isNewerTariffPackage(normalizedTariffs, 0), true);
assert.equal(isNewerTariffPackage(normalizedTariffs, 2), false);
assert.throws(
  () => normalizeTariffPackage(
    { version: 3, effectiveFrom: '2026-10-01', rates: {}, energyLimit: DEFAULT_ENERGY_LIMIT },
    Object.keys(DEFAULT_RATES)
  ),
  /Nedostaje tarifna stavka/
);
assert.throws(
  () => normalizeTariffPackage({ version: 3, effectiveFrom: '2026-10-01', rates: DEFAULT_RATES }, Object.keys(DEFAULT_RATES)),
  /pragu potrošnje/
);
assert.throws(() => normalizeEnergyLimitPolicy({ ...DEFAULT_ENERGY_LIMIT, thresholdKwh: 0 }), /valjani prag/);
assert.throws(() => normalizeEnergyLimitPolicy({ ...DEFAULT_ENERGY_LIMIT, scope: 'customer' }), /po mjernom mjestu/);

console.log('Svi testovi su prošli: obje tarife, prag 3.000 kWh, automatske cijene, više mjernih mjesta, migracija, PDF i Android JSON uvoz.');
