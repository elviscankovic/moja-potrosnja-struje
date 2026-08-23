export const REMOTE_TARIFF_URL = 'https://raw.githubusercontent.com/elviscankovic/moja-potrosnja-struje/main/web/tariffs.json';

export function normalizeTariffPackage(payload, rateKeys) {
  if (!payload || !Number.isInteger(payload.version) || payload.version < 1) {
    throw new Error('Podaci o cijenama nemaju valjanu verziju.');
  }
  if (typeof payload.effectiveFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.effectiveFrom)) {
    throw new Error('Podaci o cijenama nemaju valjani datum primjene.');
  }
  if (!payload.rates || typeof payload.rates !== 'object') {
    throw new Error('Podaci o cijenama nisu potpuni.');
  }

  const rates = {};
  for (const key of rateKeys) {
    const value = Number(payload.rates[key]);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Nedostaje tarifna stavka: ${key}.`);
    rates[key] = value;
  }

  return {
    version: payload.version,
    effectiveFrom: payload.effectiveFrom,
    checkedAt: typeof payload.checkedAt === 'string' ? payload.checkedAt : null,
    sourceUrls: Array.isArray(payload.sourceUrls) ? payload.sourceUrls.filter((url) => typeof url === 'string') : [],
    rates
  };
}

export function isNewerTariffPackage(payload, currentVersion) {
  return payload.version > (Number(currentVersion) || 0);
}
