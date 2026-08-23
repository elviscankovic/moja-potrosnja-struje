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

export function calculateBill(vtKwh, ntKwh, rates = DEFAULT_RATES, months = 1) {
  const vt = Math.max(0, Number(vtKwh) || 0);
  const nt = Math.max(0, Number(ntKwh) || 0);
  const periodMonths = Math.max(0, Number(months) || 0);
  const totalKwh = vt + nt;

  const energy = money(vt * rates.energyVt) + money(nt * rates.energyNt);
  const transmission = money(vt * rates.transmissionVt) + money(nt * rates.transmissionNt);
  const distribution = money(vt * rates.distributionVt) + money(nt * rates.distributionNt);
  const renewable = money(totalKwh * rates.renewableFee);
  const supply = money(periodMonths * rates.supplyFee);
  const metering = money(periodMonths * rates.meteringFee);
  const subtotal = money(energy + transmission + distribution + renewable + supply + metering);
  const vat = money(subtotal * (rates.vatRate / 100));

  return { vt, nt, totalKwh, energy, transmission, distribution, renewable, supply, metering, subtotal, vat, total: money(subtotal + vat) };
}

export function calculateSingleTariffBill(kwh, rates = DEFAULT_RATES, months = 1) {
  const usage = Math.max(0, Number(kwh) || 0);
  const periodMonths = Math.max(0, Number(months) || 0);
  const energy = money(usage * rates.energySingle);
  const transmission = money(usage * rates.transmissionSingle);
  const distribution = money(usage * rates.distributionSingle);
  const renewable = money(usage * rates.renewableFee);
  const supply = money(periodMonths * rates.supplyFee);
  const metering = money(periodMonths * rates.meteringFee);
  const subtotal = money(energy + transmission + distribution + renewable + supply + metering);
  const vat = money(subtotal * (rates.vatRate / 100));

  return { vt: usage, nt: 0, totalKwh: usage, energy, transmission, distribution, renewable, supply, metering, subtotal, vat, total: money(subtotal + vat) };
}

export function monthsBetween(startDate, endDate) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 1;
  const days = (end - start) / 86400000;
  return Math.max(1, Math.round(days / 30.4375));
}

export function enrichReadings(readings, rates = DEFAULT_RATES, meterType = 'dual') {
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((reading, index) => {
    if (index === 0) return { ...reading, usage: null, bill: null, months: 0 };
    const previous = sorted[index - 1];
    const vt = reading.vt - previous.vt;
    const nt = reading.nt - previous.nt;
    const months = monthsBetween(previous.date, reading.date);
    const bill = meterType === 'single'
      ? calculateSingleTariffBill(vt, rates, months)
      : calculateBill(vt, nt, rates, months);
    return { ...reading, usage: { vt, nt, total: vt + nt }, bill, months };
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
