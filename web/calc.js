export const DEFAULT_RATES = Object.freeze({
  energySingle: 0.091324,
  energyVt: 0.097189,
  energyNt: 0.047688,
  transmissionSingle: 0.014716,
  transmissionVt: 0.021256,
  transmissionNt: 0.008175,
  distributionSingle: 0.037608,
  distributionVt: 0.044446,
  distributionNt: 0.020514,
  renewableFee: 0.013239,
  supplyFee: 0.982,
  meteringFee: 1.983,
  vatRate: 13
});

function money(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function energySurcharge(excessVt, excessNt, rates, surchargePercent, singleTariff = false) {
  const factor = Math.max(0, Number(surchargePercent) || 0) / 100;
  const vt = Math.max(0, Number(excessVt) || 0);
  const nt = Math.max(0, Number(excessNt) || 0);
  if (singleTariff) return money(vt * rates.energySingle * factor);
  return money(vt * rates.energyVt * factor) + money(nt * rates.energyNt * factor);
}

export function calculateBill(vtKwh, ntKwh, rates = DEFAULT_RATES, months = 1, limit = {}) {
  const vt = Math.max(0, Number(vtKwh) || 0);
  const nt = Math.max(0, Number(ntKwh) || 0);
  const periodMonths = Math.max(0, Number(months) || 0);
  const totalKwh = vt + nt;

  const energyBase = money(vt * rates.energyVt) + money(nt * rates.energyNt);
  const energySurchargeAmount = energySurcharge(
    limit.excessVt,
    limit.excessNt,
    rates,
    limit.surchargePercent
  );
  const energy = money(energyBase + energySurchargeAmount);
  const transmission = money(vt * rates.transmissionVt) + money(nt * rates.transmissionNt);
  const distribution = money(vt * rates.distributionVt) + money(nt * rates.distributionNt);
  const renewable = money(totalKwh * rates.renewableFee);
  const supply = money(periodMonths * rates.supplyFee);
  const metering = money(periodMonths * rates.meteringFee);
  const subtotal = money(energy + transmission + distribution + renewable + supply + metering);
  const vat = money(subtotal * (rates.vatRate / 100));

  return {
    vt, nt, totalKwh, energyBase, energySurcharge: energySurchargeAmount, energy,
    transmission, distribution, renewable, supply, metering, subtotal, vat,
    total: money(subtotal + vat)
  };
}

export function calculateSingleTariffBill(kwh, rates = DEFAULT_RATES, months = 1, limit = {}) {
  const usage = Math.max(0, Number(kwh) || 0);
  const periodMonths = Math.max(0, Number(months) || 0);
  const energyBase = money(usage * rates.energySingle);
  const energySurchargeAmount = energySurcharge(
    limit.excessVt,
    0,
    rates,
    limit.surchargePercent,
    true
  );
  const energy = money(energyBase + energySurchargeAmount);
  const transmission = money(usage * rates.transmissionSingle);
  const distribution = money(usage * rates.distributionSingle);
  const renewable = money(usage * rates.renewableFee);
  const supply = money(periodMonths * rates.supplyFee);
  const metering = money(periodMonths * rates.meteringFee);
  const subtotal = money(energy + transmission + distribution + renewable + supply + metering);
  const vat = money(subtotal * (rates.vatRate / 100));

  return {
    vt: usage, nt: 0, totalKwh: usage, energyBase, energySurcharge: energySurchargeAmount, energy,
    transmission, distribution, renewable, supply, metering, subtotal, vat,
    total: money(subtotal + vat)
  };
}

function utcDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function allocateEnergyLimitUsage(vtKwh, ntKwh, startDate, endDate, policy, consumedBefore = 0) {
  const vt = Math.max(0, Number(vtKwh) || 0);
  const nt = Math.max(0, Number(ntKwh) || 0);
  const before = Math.max(0, Number(consumedBefore) || 0);
  const empty = {
    intervalKwh: 0,
    cumulativeKwh: before,
    excessKwh: 0,
    excessVt: 0,
    excessNt: 0,
    surchargePercent: 0
  };
  if (!policy?.enabled) return empty;

  const start = utcDay(startDate);
  const end = utcDay(endDate);
  const policyStart = utcDay(policy.periodStart);
  const policyEndExclusive = utcDay(policy.periodEnd) + 86400000;
  if (![start, end, policyStart, policyEndExclusive].every(Number.isFinite) || end <= start) return empty;

  const overlapStart = Math.max(start, policyStart);
  const overlapEnd = Math.min(end, policyEndExclusive);
  if (overlapEnd <= overlapStart) return empty;

  const overlapRatio = (overlapEnd - overlapStart) / (end - start);
  const intervalVt = vt * overlapRatio;
  const intervalNt = nt * overlapRatio;
  const intervalKwh = intervalVt + intervalNt;
  const threshold = Math.max(0, Number(policy.thresholdKwh) || 0);
  const excessBefore = Math.max(0, before - threshold);
  const cumulativeKwh = before + intervalKwh;
  const excessAfter = Math.max(0, cumulativeKwh - threshold);
  const excessKwh = Math.min(intervalKwh, Math.max(0, excessAfter - excessBefore));
  const excessRatio = intervalKwh > 0 ? excessKwh / intervalKwh : 0;

  return {
    intervalKwh,
    cumulativeKwh,
    excessKwh,
    excessVt: intervalVt * excessRatio,
    excessNt: intervalNt * excessRatio,
    surchargePercent: Math.max(0, Number(policy.surchargePercent) || 0)
  };
}

export function monthsBetween(startDate, endDate) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 1;
  const days = (end - start) / 86400000;
  return Math.max(1, Math.round(days / 30.4375));
}

export function enrichReadings(readings, rates = DEFAULT_RATES, meterType = 'dual', energyLimit = null) {
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  let consumedInLimitPeriod = 0;
  return sorted.map((reading, index) => {
    if (index === 0) return { ...reading, usage: null, bill: null, months: 0 };
    const previous = sorted[index - 1];
    const vt = reading.vt - previous.vt;
    const nt = reading.nt - previous.nt;
    const months = monthsBetween(previous.date, reading.date);
    const limit = allocateEnergyLimitUsage(
      vt,
      nt,
      previous.date,
      reading.date,
      energyLimit,
      consumedInLimitPeriod
    );
    consumedInLimitPeriod = limit.cumulativeKwh;
    const bill = meterType === 'single'
      ? calculateSingleTariffBill(vt, rates, months, limit)
      : calculateBill(vt, nt, rates, months, limit);
    return { ...reading, usage: { vt, nt, total: vt + nt }, bill, months, energyLimit: limit };
  });
}

export function validateReading(candidate, readings, editingId = null, meterType = 'dual') {
  if (!candidate.date) return 'Odaberi datum očitanja.';
  if (!Number.isFinite(candidate.vt) || candidate.vt < 0) {
    return meterType === 'single' ? 'Upiši ispravno stanje brojila.' : 'Upiši ispravno stanje više tarife (VT).';
  }
  if (meterType === 'dual' && (!Number.isFinite(candidate.nt) || candidate.nt < 0)) return 'Upiši ispravno stanje niže tarife (NT).';

  const others = readings
    .filter((item) => item.id !== editingId)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (others.some((item) => item.date === candidate.date)) {
    return 'Za taj datum već postoji očitanje. Uredi postojeći zapis.';
  }

  // Novi unos uvijek mora nastaviti kronološki niz. Uređivanje postojećeg
  // zapisa i dalje smije ostati između susjednih zapisa, uz kontrolu stanja.
  if (!editingId && others.length) {
    const latest = others.at(-1);
    if (candidate.date <= latest.date) {
      return `Datum mora biti noviji od zadnjeg očitanja (${formatDate(latest.date)}).`;
    }
    if (candidate.vt < latest.vt) {
      return meterType === 'single'
        ? `Stanje ne može biti manje od zadnjeg stanja (${latest.vt} kWh).`
        : `VT ne može biti manji od zadnjeg stanja (${latest.vt} kWh).`;
    }
    if (meterType === 'dual' && candidate.nt < latest.nt) {
      return `NT ne može biti manji od zadnjeg stanja (${latest.nt} kWh).`;
    }
    if (candidate.vt === latest.vt && candidate.nt === latest.nt) {
      return 'Novo očitanje mora imati veću vrijednost barem jedne tarife (VT ili NT).';
    }
    return null;
  }

  const previous = [...others].reverse().find((item) => item.date < candidate.date);
  const next = others.find((item) => item.date > candidate.date);

  if (previous && (candidate.vt < previous.vt || candidate.nt < previous.nt)) {
    return `Stanje ne može biti manje od prethodnog očitanja (${formatDate(previous.date)}).`;
  }
  if (previous && candidate.vt === previous.vt && candidate.nt === previous.nt) {
    return `Očitanje ne može biti potpuno jednako prethodnom (${formatDate(previous.date)}).`;
  }
  if (next && (candidate.vt > next.vt || candidate.nt > next.nt)) {
    return `Stanje ne može biti veće od sljedećeg očitanja (${formatDate(next.date)}).`;
  }
  if (next && candidate.vt === next.vt && candidate.nt === next.nt) {
    return `Očitanje ne može biti potpuno jednako sljedećem (${formatDate(next.date)}).`;
  }
  return null;
}

export function formatDate(value) {
  return new Intl.DateTimeFormat('hr-HR').format(new Date(`${value}T12:00:00`));
}
