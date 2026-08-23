export const METER_TYPES = Object.freeze({
  SINGLE: 'single',
  DUAL: 'dual'
});

export function meterTypeLabel(type) {
  return type === METER_TYPES.SINGLE ? 'Jednotarifno brojilo' : 'Dvotarifno brojilo';
}

function normalizeMeter(meter, index) {
  const type = meter?.type === METER_TYPES.SINGLE ? METER_TYPES.SINGLE : METER_TYPES.DUAL;
  return {
    id: typeof meter?.id === 'string' && meter.id ? meter.id : `meter-${index + 1}`,
    name: typeof meter?.name === 'string' && meter.name.trim() ? meter.name.trim() : `Mjerno mjesto ${index + 1}`,
    type,
    readings: Array.isArray(meter?.readings)
      ? meter.readings.map((reading) => ({
          ...reading,
          vt: Number(reading.vt ?? reading.value ?? 0),
          nt: type === METER_TYPES.SINGLE ? 0 : Number(reading.nt ?? 0)
        }))
      : []
  };
}

export function migrateState(saved, defaultRates) {
  const rates = { ...defaultRates, ...(saved?.rates || {}) };
  const tariffMeta = {
    tariffVersion: Number.isInteger(saved?.tariffVersion) ? saved.tariffVersion : 1,
    ratesEffectiveFrom: typeof saved?.ratesEffectiveFrom === 'string' ? saved.ratesEffectiveFrom : '2026-01-01',
    lastTariffCheck: typeof saved?.lastTariffCheck === 'string' ? saved.lastTariffCheck : null,
    ratesCustomized: saved?.ratesCustomized === true,
    autoTariffCheck: saved?.autoTariffCheck !== false
  };

  if (Array.isArray(saved?.meters) && saved.meters.length) {
    const meters = saved.meters.map(normalizeMeter);
    const activeMeterId = meters.some((meter) => meter.id === saved.activeMeterId)
      ? saved.activeMeterId
      : meters[0].id;
    return { meters, activeMeterId, rates, ...tariffMeta };
  }

  const meter = normalizeMeter({
    id: 'meter-default',
    name: 'Glavno brojilo',
    type: METER_TYPES.DUAL,
    readings: Array.isArray(saved?.readings) ? saved.readings : []
  }, 0);

  return { meters: [meter], activeMeterId: meter.id, rates, ...tariffMeta };
}

export function countReadings(state) {
  return state.meters.reduce((total, meter) => total + meter.readings.length, 0);
}
