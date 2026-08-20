export const DEFAULT_RATES = Object.freeze({
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
});

function money(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateBill(vtKwh, ntKwh, rates = DEFAULT_RATES, months = 1) {
  const vt = Math.max(0, Number(vtKwh) || 0);
  const nt = Math.max(0, Number(ntKwh) || 0);
  const periodMonths = Math.max(0, Number(months) || 0);
  const totalKwh = vt + nt;

  // HEP na računu najprije zaokružuje svaki tarifni redak na cent,
  // a tek zatim zbraja stavke. To je važno za potpuno podudaranje izračuna.
  const energy = money(vt * rates.energyVt) + money(nt * rates.energyNt);
  const transmission = money(vt * rates.transmissionVt) + money(nt * rates.transmissionNt);
  const distribution = money(vt * rates.distributionVt) + money(nt * rates.distributionNt);
  const renewable = money(totalKwh * rates.renewableFee);
  const supply = money(periodMonths * rates.supplyFee);
  const metering = money(periodMonths * rates.meteringFee);
  const subtotal = money(energy + transmission + distribution + renewable + supply + metering);
  const vat = money(subtotal * (rates.vatRate / 100));

  return {
    vt,
    nt,
    totalKwh,
    energy,
    transmission,
    distribution,
    renewable,
    supply,
    metering,
    subtotal,
    vat,
    total: money(subtotal + vat)
  };
}

export function monthsBetween(startDate, endDate) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 1;
  const days = (end - start) / 86400000;
  return Math.max(1, Math.round(days / 30.4375));
}

export function enrichReadings(readings, rates = DEFAULT_RATES) {
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((reading, index) => {
    if (index === 0) return { ...reading, usage: null, bill: null, months: 0 };
    const previous = sorted[index - 1];
    const vt = reading.vt - previous.vt;
    const nt = reading.nt - previous.nt;
    const months = monthsBetween(previous.date, reading.date);
    return {
      ...reading,
      usage: { vt, nt, total: vt + nt },
      bill: calculateBill(vt, nt, rates, months),
      months
    };
  });
}

export function validateReading(candidate, readings, editingId = null) {
  if (!candidate.date) return 'Odaberi datum očitanja.';
  if (!Number.isFinite(candidate.vt) || candidate.vt < 0) return 'Upiši ispravno stanje više tarife (VT).';
  if (!Number.isFinite(candidate.nt) || candidate.nt < 0) return 'Upiši ispravno stanje niže tarife (NT).';

  const others = readings
    .filter((item) => item.id !== editingId)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (others.some((item) => item.date === candidate.date)) {
    return 'Za taj datum već postoji očitanje. Uredi postojeći zapis.';
  }

  const previous = [...others].reverse().find((item) => item.date < candidate.date);
  const next = others.find((item) => item.date > candidate.date);

  if (previous && (candidate.vt < previous.vt || candidate.nt < previous.nt)) {
    return `Stanje ne može biti manje od prethodnog očitanja (${formatDate(previous.date)}).`;
  }
  if (next && (candidate.vt > next.vt || candidate.nt > next.nt)) {
    return `Stanje ne može biti veće od sljedećeg očitanja (${formatDate(next.date)}).`;
  }
  return null;
}

export function formatDate(value) {
  return new Intl.DateTimeFormat('hr-HR').format(new Date(`${value}T12:00:00`));
}
