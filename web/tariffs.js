export const REMOTE_TARIFF_URL = 'https://raw.githubusercontent.com/elviscankovic/moja-potrosnja-struje/main/web/tariffs.json';

export const DEFAULT_ENERGY_LIMIT = Object.freeze({
  enabled: true,
  periodStart: '2026-04-01',
  periodEnd: '2026-09-30',
  thresholdKwh: 3000,
  surchargePercent: 35,
  scope: 'meter'
});

export const BUNDLED_TARIFF_META = Object.freeze({
  version: 2,
  effectiveFrom: '2026-01-01',
  energyLimit: DEFAULT_ENERGY_LIMIT
});

export function normalizeEnergyLimitPolicy(policy) {
  if (!policy || policy.enabled !== true) return { enabled: false };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(policy.periodStart || '')
      || !/^\d{4}-\d{2}-\d{2}$/.test(policy.periodEnd || '')
      || policy.periodEnd < policy.periodStart) {
    throw new Error('Pravilo potrošnje nema valjano razdoblje.');
  }

  const thresholdKwh = Number(policy.thresholdKwh);
  const surchargePercent = Number(policy.surchargePercent);
  if (!Number.isFinite(thresholdKwh) || thresholdKwh <= 0) {
    throw new Error('Pravilo potrošnje nema valjani prag.');
  }
  if (!Number.isFinite(surchargePercent) || surchargePercent < 0) {
    throw new Error('Pravilo potrošnje nema valjano uvećanje.');
  }
  if (policy.scope !== 'meter') {
    throw new Error('Prag potrošnje mora se primjenjivati po mjernom mjestu.');
  }

  return {
    enabled: true,
    periodStart: policy.periodStart,
    periodEnd: policy.periodEnd,
    thresholdKwh,
    surchargePercent,
    scope: 'meter'
  };
}

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
  if (!payload.energyLimit || typeof payload.energyLimit !== 'object') {
    throw new Error('Podaci o pragu potrošnje nisu potpuni.');
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
    rates,
    energyLimit: normalizeEnergyLimitPolicy(payload.energyLimit)
  };
}

export function isNewerTariffPackage(payload, currentVersion) {
  return payload.version > (Number(currentVersion) || 0);
}
