import { DEFAULT_RATES, enrichReadings, formatDate, validateReading } from './calc.js';
import { parseBackup, readBackupFile } from './backup.js';
import { METER_TYPES, countReadings, meterTypeLabel, migrateState } from './model.js';
import {
  BUNDLED_TARIFF_META,
  REMOTE_TARIFF_URL,
  isNewerTariffPackage,
  normalizeTariffPackage
} from './tariffs.js';

const STORAGE_KEY = 'moja-potrosnja-struje-v1';
const state = loadState();
const IS_NATIVE = Boolean(window.Capacitor?.isNativePlatform?.());
let deferredInstallPrompt = null;
let toastTimer = null;

const elements = {
  meterSelect: document.querySelector('#meterSelect'),
  addMeterBtn: document.querySelector('#addMeterBtn'),
  editMeterBtn: document.querySelector('#editMeterBtn'),
  deleteMeterBtn: document.querySelector('#deleteMeterBtn'),
  meterFormPanel: document.querySelector('#meterFormPanel'),
  meterForm: document.querySelector('#meterForm'),
  meterEditingId: document.querySelector('#meterEditingId'),
  meterName: document.querySelector('#meterName'),
  meterType: document.querySelector('#meterType'),
  meterTypeHelp: document.querySelector('#meterTypeHelp'),
  cancelMeterBtn: document.querySelector('#cancelMeterBtn'),
  activeMeterName: document.querySelector('#activeMeterName'),
  activeMeterType: document.querySelector('#activeMeterType'),
  form: document.querySelector('#readingForm'),
  editingId: document.querySelector('#editingId'),
  date: document.querySelector('#readingDate'),
  vt: document.querySelector('#readingVt'),
  nt: document.querySelector('#readingNt'),
  vtLabelText: document.querySelector('#vtLabelText'),
  ntField: document.querySelector('#ntField'),
  readingHelp: document.querySelector('#readingHelp'),
  note: document.querySelector('#readingNote'),
  error: document.querySelector('#formError'),
  saveBtn: document.querySelector('#saveReadingBtn'),
  cancelBtn: document.querySelector('#cancelEditBtn'),
  historyBody: document.querySelector('#historyBody'),
  historyStateHeader: document.querySelector('#historyStateHeader'),
  emptyState: document.querySelector('#emptyState'),
  emptyTitle: document.querySelector('#emptyTitle'),
  emptyText: document.querySelector('#emptyText'),
  readingCount: document.querySelector('#readingCount'),
  filterFrom: document.querySelector('#filterFrom'),
  filterTo: document.querySelector('#filterTo'),
  clearFiltersBtn: document.querySelector('#clearFiltersBtn'),
  printTitle: document.querySelector('#printTitle'),
  printFilter: document.querySelector('#printFilter'),
  checkRatesBtn: document.querySelector('#checkRatesBtn'),
  autoTariffCheck: document.querySelector('#autoTariffCheck'),
  tariffStatus: document.querySelector('#tariffStatus'),
  energyLimitStatus: document.querySelector('#energyLimitStatus'),
  chart: document.querySelector('#chart'),
  toast: document.querySelector('#toast'),
  installBtn: document.querySelector('#installBtn')
};

const rateIds = Object.keys(DEFAULT_RATES);

function loadState() {
  try {
    return migrateState(JSON.parse(localStorage.getItem(STORAGE_KEY)), DEFAULT_RATES, BUNDLED_TARIFF_META);
  } catch {
    return migrateState(null, DEFAULT_RATES, BUNDLED_TARIFF_META);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function activeMeter() {
  return state.meters.find((meter) => meter.id === state.activeMeterId) || state.meters[0];
}

function number(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('hr-HR', { maximumFractionDigits }).format(value);
}

function euro(value) {
  return new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(value);
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => elements.toast.classList.add('hidden'), 2800);
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.classList.toggle('hidden', !message);
}

function resetForm() {
  elements.form.reset();
  elements.editingId.value = '';
  elements.date.value = today();
  elements.saveBtn.textContent = 'Spremi očitanje';
  elements.cancelBtn.classList.add('hidden');
  showError('');
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function filteredReadings(readings) {
  const from = elements.filterFrom.value;
  const to = elements.filterTo.value;
  return readings.filter((item) => (!from || item.date >= from) && (!to || item.date <= to));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

async function addPdfFont(doc) {
  const response = await fetch('./DejaVuSans.ttf');
  if (!response.ok) throw new Error('Font za PDF nije dostupan.');
  const fontData = arrayBufferToBase64(await response.arrayBuffer());
  doc.addFileToVFS('DejaVuSans.ttf', fontData);
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.setFont('DejaVu');
}

function drawPdfTableHeader(doc, y, widths) {
  const headers = ['Datum', 'Stanje brojila', 'Potrošnja', 'Cijena'];
  let x = 14;
  doc.setFillColor(235, 238, 241);
  doc.setDrawColor(150, 150, 150);
  doc.setFontSize(9);
  headers.forEach((header, index) => {
    doc.rect(x, y, widths[index], 9, 'FD');
    doc.text(header, x + 2, y + 6);
    x += widths[index];
  });
  return y + 9;
}

async function createReadingsPdf() {
  const meter = activeMeter();
  const allReadings = enrichReadings(meter.readings, state.rates, meter.type, state.energyLimit);
  const readings = filteredReadings(allReadings);
  if (!readings.length) throw new Error('Nema filtriranih podataka za PDF.');
  if (!window.jspdf?.jsPDF) throw new Error('PDF modul nije dostupan.');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await addPdfFont(doc);
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(16);
  doc.text('Moja potrošnja struje', 14, 17);
  doc.setFontSize(11);
  doc.text(meter.name, 14, 24);
  doc.setFontSize(9);
  const fromText = elements.filterFrom.value ? formatDate(elements.filterFrom.value) : 'početka';
  const toText = elements.filterTo.value ? formatDate(elements.filterTo.value) : 'kraja';
  doc.text(elements.filterFrom.value || elements.filterTo.value ? `Razdoblje: ${fromText} – ${toText}` : 'Sva očitanja', 14, 30);

  const widths = [35, 50, 67, 30];
  let y = drawPdfTableHeader(doc, 35, widths);
  doc.setFontSize(8.5);

  for (const item of readings) {
    const stateLines = meter.type === METER_TYPES.SINGLE
      ? [`${number(item.vt)} kWh`]
      : [`VT ${number(item.vt)} kWh`, `NT ${number(item.nt)} kWh`];
    const usageLines = !item.usage
      ? ['Početno stanje']
      : meter.type === METER_TYPES.SINGLE
        ? [`${number(item.usage.total)} kWh`]
        : [`Ukupno ${number(item.usage.total)} kWh`, `VT ${number(item.usage.vt)} · NT ${number(item.usage.nt)}`];
    const cells = [
      [formatDate(item.date)],
      stateLines,
      usageLines,
      [item.bill ? euro(item.bill.total) : '—']
    ];
    const rowHeight = Math.max(...cells.map((cell) => cell.length)) > 1 ? 13 : 9;
    if (y + rowHeight > 283) {
      doc.addPage();
      y = drawPdfTableHeader(doc, 14, widths);
      doc.setFontSize(8.5);
    }
    let x = 14;
    cells.forEach((cell, index) => {
      doc.rect(x, y, widths[index], rowHeight);
      doc.text(cell, x + 2, y + 5, { lineHeightFactor: 1.35 });
      x += widths[index];
    });
    y += rowHeight;
  }

  const fileName = `potrosnja-struje-${today()}.pdf`;
  if (IS_NATIVE && window.Capacitor?.Plugins?.Filesystem && window.Capacitor?.Plugins?.Share) {
    const saved = await window.Capacitor.Plugins.Filesystem.writeFile({
      path: fileName,
      data: arrayBufferToBase64(doc.output('arraybuffer')),
      directory: 'CACHE'
    });
    await window.Capacitor.Plugins.Share.share({
      title: 'PDF pregled potrošnje struje',
      text: `${meter.name} — ${readings.length} zapisa`,
      url: saved.uri,
      dialogTitle: 'Spremi ili podijeli PDF'
    });
  } else {
    doc.save(fileName);
  }
}

function render() {
  const meter = activeMeter();
  const enriched = enrichReadings(meter.readings, state.rates, meter.type, state.energyLimit);
  renderMeterControls(meter);
  renderSummary(enriched);
  renderHistory(enriched, meter);
  renderChart(enriched, meter.type);
  renderRates(enriched);
}

function renderMeterControls(meter) {
  elements.meterSelect.innerHTML = state.meters
    .map((item) => `<option value="${item.id}"${item.id === meter.id ? ' selected' : ''}>${escapeHtml(item.name)}</option>`)
    .join('');
  elements.deleteMeterBtn.disabled = state.meters.length === 1;
  elements.activeMeterName.textContent = meter.name;
  elements.activeMeterType.textContent = meterTypeLabel(meter.type);
  elements.vtLabelText.textContent = meter.type === METER_TYPES.SINGLE
    ? 'Stanje brojila (kWh)'
    : 'VT — viša tarifa (kWh)';
  elements.ntField.classList.toggle('hidden', meter.type === METER_TYPES.SINGLE);
  elements.nt.required = meter.type === METER_TYPES.DUAL;
  elements.readingHelp.textContent = meter.type === METER_TYPES.SINGLE
    ? 'Upiši ukupno stanje prikazano na brojilu.'
    : 'Za elektroničko brojilo: VT je 1.8.1, a NT 1.8.2.';
  elements.historyStateHeader.textContent = meter.type === METER_TYPES.SINGLE ? 'Stanje brojila' : 'Stanje VT / NT';
}

function renderSummary(readings) {
  const periods = readings.filter((item) => item.usage);
  const latest = periods.at(-1);

  document.querySelector('#lastConsumption').textContent = latest ? `${number(latest.usage.total)} kWh` : '—';
  document.querySelector('#lastCost').textContent = latest ? euro(latest.bill.total) : '—';
  document.querySelector('#lastPeriod').textContent = latest
    ? `${formatDate(readings.at(-2).date)} – ${formatDate(latest.date)}`
    : 'Dodaj dva očitanja';

  if (periods.length) {
    const totalMonths = periods.reduce((sum, item) => sum + item.months, 0);
    const average = periods.reduce((sum, item) => sum + item.usage.total, 0) / totalMonths;
    document.querySelector('#averageConsumption').textContent = `${number(average)} kWh`;
    document.querySelector('#averageInfo').textContent = `na temelju ${periods.length} razdoblja`;
  } else {
    document.querySelector('#averageConsumption').textContent = '—';
    document.querySelector('#averageInfo').textContent = 'nema dovoljno podataka';
  }

  const currentYear = String(new Date().getFullYear());
  const yearPeriods = periods.filter((item) => item.date.startsWith(currentYear));
  const yearKwh = yearPeriods.reduce((sum, item) => sum + item.usage.total, 0);
  const yearEuro = yearPeriods.reduce((sum, item) => sum + item.bill.total, 0);
  document.querySelector('#yearConsumption').textContent = yearPeriods.length ? `${number(yearKwh)} kWh` : '—';
  document.querySelector('#yearCost').textContent = yearPeriods.length ? `procjena ${euro(yearEuro)}` : 'nema podataka';

  const billPanel = document.querySelector('#billPanel');
  billPanel.classList.toggle('hidden', !latest);
  if (latest) {
    const previous = readings.at(-2);
    document.querySelector('#billPeriod').textContent = `${formatDate(previous.date)} – ${formatDate(latest.date)}`;
    document.querySelector('#billEnergy').textContent = euro(latest.bill.energyBase);
    const surchargeRow = document.querySelector('#billSurchargeRow');
    surchargeRow.classList.toggle('hidden', latest.bill.energySurcharge <= 0);
    document.querySelector('#billEnergySurcharge').textContent = euro(latest.bill.energySurcharge);
    document.querySelector('#billTransmission').textContent = euro(latest.bill.transmission);
    document.querySelector('#billDistribution').textContent = euro(latest.bill.distribution);
    document.querySelector('#billRenewable').textContent = euro(latest.bill.renewable);
    document.querySelector('#billFixed').textContent = euro(latest.bill.supply + latest.bill.metering);
    document.querySelector('#billSubtotal').textContent = euro(latest.bill.subtotal);
    document.querySelector('#billVat').textContent = euro(latest.bill.vat);
    document.querySelector('#billTotal').textContent = euro(latest.bill.total);
  }
}

function renderHistory(allReadings, meter) {
  const readings = filteredReadings(allReadings);
  const filtersActive = Boolean(elements.filterFrom.value || elements.filterTo.value);
  elements.historyBody.innerHTML = '';
  elements.emptyState.classList.toggle('hidden', readings.length > 0);
  elements.emptyTitle.textContent = filtersActive ? 'Nema zapisa u tom razdoblju' : 'Još nema očitanja';
  elements.emptyText.textContent = filtersActive
    ? 'Promijeni ili ukloni datumski filtar.'
    : 'Unesi prvo stanje brojila. Potrošnja će se prikazati nakon drugog očitanja.';
  elements.readingCount.textContent = filtersActive
    ? `${readings.length} od ${allReadings.length} zapisa`
    : `${readings.length} ${readings.length === 1 ? 'očitanje' : 'očitanja'}`;

  elements.printTitle.textContent = `Moja potrošnja struje — ${meter.name}`;
  const fromText = elements.filterFrom.value ? formatDate(elements.filterFrom.value) : 'početka';
  const toText = elements.filterTo.value ? formatDate(elements.filterTo.value) : 'kraja';
  elements.printFilter.textContent = filtersActive ? `Razdoblje: ${fromText} – ${toText}` : 'Sva očitanja';

  [...readings].reverse().forEach((item) => {
    const row = document.createElement('tr');
    const usage = item.usage
      ? meter.type === METER_TYPES.SINGLE
        ? `<strong>${number(item.usage.total)} kWh</strong>`
        : `<strong>${number(item.usage.total)} kWh</strong><small>VT ${number(item.usage.vt)} · NT ${number(item.usage.nt)}</small>`
      : '<span class="baseline">Početno stanje</span>';
    const stateText = meter.type === METER_TYPES.SINGLE
      ? `<span>${number(item.vt)} kWh</span>`
      : `<span>VT ${number(item.vt)}</span><small>NT ${number(item.nt)}</small>`;
    const cost = item.bill ? `<strong>${euro(item.bill.total)}</strong>` : '—';
    row.innerHTML = `
      <td data-label="Datum"><div class="cell-content"><strong>${formatDate(item.date)}</strong>${item.note ? `<small class="screen-note">${escapeHtml(item.note)}</small>` : ''}</div></td>
      <td data-label="Stanje"><div class="cell-content">${stateText}</div></td>
      <td data-label="Potrošnja"><div class="cell-content">${usage}</div></td>
      <td data-label="Cijena"><div class="cell-content">${cost}</div></td>
      <td class="row-actions">
        <button class="icon-button edit-button" data-id="${item.id}" type="button" aria-label="Uredi očitanje">Uredi</button>
        <button class="icon-button danger delete-button" data-id="${item.id}" type="button" aria-label="Obriši očitanje">Obriši</button>
      </td>`;
    elements.historyBody.append(row);
  });
}

function renderChart(readings, meterType) {
  const periods = readings.filter((item) => item.usage).slice(-12);
  elements.chart.innerHTML = '';
  document.querySelector('#dualLegend').classList.toggle('hidden', meterType === METER_TYPES.SINGLE);
  if (!periods.length) {
    elements.chart.innerHTML = '<p class="chart-empty">Graf će se pojaviti nakon drugog očitanja.</p>';
    return;
  }
  const max = Math.max(...periods.map((item) => item.usage.total), 1);
  periods.forEach((item) => {
    const column = document.createElement('div');
    column.className = 'chart-column';
    const vtHeight = (item.usage.vt / max) * 100;
    const ntHeight = (item.usage.nt / max) * 100;
    column.innerHTML = `
      <div class="chart-value">${number(item.usage.total, 0)}</div>
      <div class="bar" title="${formatDate(item.date)}: ${number(item.usage.total)} kWh">
        <div class="bar-part bar-vt" style="height:${vtHeight}%"></div>
        ${meterType === METER_TYPES.DUAL ? `<div class="bar-part bar-nt" style="height:${ntHeight}%"></div>` : ''}
      </div>
      <div class="chart-label">${new Intl.DateTimeFormat('hr-HR', { month: 'short', year: '2-digit' }).format(new Date(`${item.date}T12:00:00`))}</div>`;
    elements.chart.append(column);
  });
}

function renderRates(readings = []) {
  rateIds.forEach((id) => {
    const input = document.querySelector(`#${id}`);
    if (input && document.activeElement !== input) input.value = state.rates[id];
  });
  elements.autoTariffCheck.checked = state.autoTariffCheck;
  renderTariffStatus();
  renderEnergyLimitStatus(readings);
}

function renderEnergyLimitStatus(readings) {
  const policy = state.energyLimit;
  if (!policy?.enabled) {
    elements.energyLimitStatus.textContent = 'Prag povećane cijene trenutačno nije aktivan.';
    return;
  }
  const latestWithLimit = [...readings].reverse().find((item) => item.energyLimit);
  const trackedKwh = latestWithLimit?.energyLimit?.cumulativeKwh || 0;
  const excessKwh = Math.max(0, trackedKwh - policy.thresholdKwh);
  const progress = trackedKwh > 0
    ? excessKwh > 0
      ? ` Prema upisanim očitanjima evidentirano je ${number(trackedKwh)} kWh, od čega ${number(excessKwh)} kWh iznad praga.`
      : ` Prema upisanim očitanjima evidentirano je ${number(trackedKwh)} kWh; do praga ostaje ${number(policy.thresholdKwh - trackedKwh)} kWh.`
    : '';
  elements.energyLimitStatus.textContent = `Od ${formatDate(policy.periodStart)} do ${formatDate(policy.periodEnd)}: `
    + `iznad ${number(policy.thresholdKwh, 0)} kWh po mjernom mjestu cijena radne energije uvećava se ${number(policy.surchargePercent, 0)}%.`
    + progress;
}

function renderTariffStatus(message = '') {
  if (message) {
    elements.tariffStatus.textContent = message;
    return;
  }
  const effectiveDate = state.ratesEffectiveFrom ? formatDate(state.ratesEffectiveFrom) : 'nepoznatog datuma';
  const customized = state.ratesCustomized ? 'Ručno prilagođene cijene' : 'Službene cijene';
  const automatic = state.autoTariffCheck ? 'automatska provjera uključena' : 'automatska provjera isključena';
  elements.tariffStatus.textContent = `${customized} · paket ${state.tariffVersion} · ${automatic} · u primjeni od ${effectiveDate}`;
}

async function fetchTariffPackage() {
  const separator = REMOTE_TARIFF_URL.includes('?') ? '&' : '?';
  const response = await fetch(`${REMOTE_TARIFF_URL}${separator}provjera=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Provjera cijena trenutačno nije dostupna.');
  return normalizeTariffPackage(await response.json(), rateIds);
}

async function checkForTariffUpdates({ manual = false } = {}) {
  if (manual) {
    elements.checkRatesBtn.disabled = true;
    renderTariffStatus('Provjeravam službene cijene…');
  }

  try {
    const tariffPackage = await fetchTariffPackage();
    state.lastTariffCheck = new Date().toISOString();

    if (!isNewerTariffPackage(tariffPackage, state.tariffVersion)) {
      saveState();
      renderTariffStatus(manual ? 'Cijene su ažurne. Nema novijeg službenog paketa.' : '');
      if (manual) showToast('Cijene su već ažurne.');
      return;
    }

    const effectiveDate = formatDate(tariffPackage.effectiveFrom);
    const shouldUpdate = window.confirm(
      `Pronađen je novi službeni paket cijena i pravila obračuna u primjeni od ${effectiveDate}. Ažurirati ga?`
    );
    if (!shouldUpdate) {
      saveState();
      renderTariffStatus(`Dostupne su nove cijene u primjeni od ${effectiveDate}.`);
      return;
    }

    state.rates = tariffPackage.rates;
    state.tariffVersion = tariffPackage.version;
    state.ratesEffectiveFrom = tariffPackage.effectiveFrom;
    state.energyLimit = tariffPackage.energyLimit;
    state.ratesCustomized = false;
    saveState();
    render();
    showToast('Službene cijene su ažurirane.');
  } catch (error) {
    console.error('Greška pri provjeri tarifnih stavki:', error);
    if (manual) {
      renderTariffStatus('Provjera cijena nije uspjela. Postojeće cijene ostaju spremljene.');
      showToast('Provjera cijena nije uspjela.');
    }
  } finally {
    if (manual) elements.checkRatesBtn.disabled = false;
  }
}

function openMeterForm(meter = null) {
  elements.meterEditingId.value = meter?.id || '';
  elements.meterName.value = meter?.name || '';
  elements.meterType.value = meter?.type || METER_TYPES.DUAL;
  elements.meterType.disabled = Boolean(meter?.readings.length);
  elements.meterTypeHelp.textContent = meter?.readings.length
    ? 'Vrsta se ne može promijeniti nakon unosa očitanja.'
    : 'Vrstu brojila možeš promijeniti dok nema očitanja.';
  elements.meterFormPanel.classList.remove('hidden');
  elements.meterName.focus();
}

function closeMeterForm() {
  elements.meterForm.reset();
  elements.meterEditingId.value = '';
  elements.meterType.disabled = false;
  elements.meterFormPanel.classList.add('hidden');
}

elements.meterSelect.addEventListener('change', () => {
  state.activeMeterId = elements.meterSelect.value;
  saveState();
  resetForm();
  closeMeterForm();
  render();
});

elements.addMeterBtn.addEventListener('click', () => openMeterForm());
elements.editMeterBtn.addEventListener('click', () => openMeterForm(activeMeter()));
elements.cancelMeterBtn.addEventListener('click', closeMeterForm);

elements.meterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = elements.meterName.value.trim();
  if (!name) return showToast('Upiši naziv mjernog mjesta.');
  const editingId = elements.meterEditingId.value;
  if (editingId) {
    const meter = state.meters.find((item) => item.id === editingId);
    meter.name = name;
    if (!meter.readings.length) meter.type = elements.meterType.value;
    showToast('Mjerno mjesto je izmijenjeno.');
  } else {
    const meter = { id: uid(), name, type: elements.meterType.value, readings: [] };
    state.meters.push(meter);
    state.activeMeterId = meter.id;
    showToast('Novo mjerno mjesto je dodano.');
  }
  saveState();
  closeMeterForm();
  resetForm();
  render();
});

elements.deleteMeterBtn.addEventListener('click', () => {
  if (state.meters.length === 1) return showToast('Mora ostati barem jedno mjerno mjesto.');
  const meter = activeMeter();
  const warning = meter.readings.length ? ` i njegovih ${meter.readings.length} očitanja` : '';
  if (!window.confirm(`Obrisati mjerno mjesto „${meter.name}”${warning}?`)) return;
  state.meters = state.meters.filter((item) => item.id !== meter.id);
  state.activeMeterId = state.meters[0].id;
  saveState();
  resetForm();
  closeMeterForm();
  render();
  showToast('Mjerno mjesto je obrisano.');
});

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const meter = activeMeter();
  const editingId = elements.editingId.value || null;
  const candidate = {
    id: editingId || uid(),
    date: elements.date.value,
    vt: Number(elements.vt.value),
    nt: meter.type === METER_TYPES.SINGLE ? 0 : Number(elements.nt.value),
    note: elements.note.value.trim()
  };
  const error = validateReading(candidate, meter.readings, editingId, meter.type);
  if (error) return showError(error);

  if (editingId) {
    const index = meter.readings.findIndex((item) => item.id === editingId);
    meter.readings[index] = candidate;
  } else {
    meter.readings.push(candidate);
  }
  meter.readings.sort((a, b) => a.date.localeCompare(b.date));
  saveState();
  render();
  resetForm();
  showToast(editingId ? 'Očitanje je izmijenjeno.' : 'Očitanje je spremljeno.');
});

elements.cancelBtn.addEventListener('click', resetForm);

elements.historyBody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  const meter = activeMeter();
  const item = meter.readings.find((reading) => reading.id === button.dataset.id);
  if (!item) return;

  if (button.classList.contains('edit-button')) {
    elements.editingId.value = item.id;
    elements.date.value = item.date;
    elements.vt.value = item.vt;
    elements.nt.value = item.nt;
    elements.note.value = item.note || '';
    elements.saveBtn.textContent = 'Spremi izmjene';
    elements.cancelBtn.classList.remove('hidden');
    showError('');
    document.querySelector('.entry-panel').scrollIntoView({ behavior: 'smooth' });
    return;
  }

  if (button.classList.contains('delete-button')) {
    if (!window.confirm(`Obrisati očitanje od ${formatDate(item.date)}?`)) return;
    meter.readings = meter.readings.filter((reading) => reading.id !== item.id);
    saveState();
    render();
    resetForm();
    showToast('Očitanje je obrisano.');
  }
});

for (const input of [elements.filterFrom, elements.filterTo]) {
  input.addEventListener('change', () => render());
}

elements.clearFiltersBtn.addEventListener('click', () => {
  elements.filterFrom.value = '';
  elements.filterTo.value = '';
  render();
});

document.querySelector('#settingsForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const nextRates = {};
  for (const id of rateIds) {
    const value = Number(document.querySelector(`#${id}`).value);
    if (!Number.isFinite(value) || value < 0) return showToast('Provjeri unesene cijene.');
    nextRates[id] = value;
  }
  state.rates = nextRates;
  state.ratesCustomized = true;
  saveState();
  render();
  showToast('Cijene su spremljene i izračuni osvježeni.');
});

document.querySelector('#resetRatesBtn').addEventListener('click', () => {
  if (!window.confirm('Vratiti sve tarifne stavke na zadane vrijednosti?')) return;
  state.rates = { ...DEFAULT_RATES };
  state.tariffVersion = BUNDLED_TARIFF_META.version;
  state.ratesEffectiveFrom = BUNDLED_TARIFF_META.effectiveFrom;
  state.energyLimit = { ...BUNDLED_TARIFF_META.energyLimit };
  state.ratesCustomized = false;
  saveState();
  render();
  showToast('Vraćene su zadane cijene.');
});

elements.checkRatesBtn.addEventListener('click', () => checkForTariffUpdates({ manual: true }));
elements.autoTariffCheck.addEventListener('change', () => {
  state.autoTariffCheck = elements.autoTariffCheck.checked;
  saveState();
  renderTariffStatus();
  showToast(state.autoTariffCheck ? 'Automatska provjera je uključena.' : 'Automatska provjera je isključena.');
});

document.querySelector('#exportBtn').addEventListener('click', async () => {
  const fileName = `potrosnja-struje-${today()}.json`;
  const contents = JSON.stringify({ version: 6, exportedAt: new Date().toISOString(), ...state }, null, 2);

  if (IS_NATIVE && window.Capacitor?.Plugins?.Filesystem && window.Capacitor?.Plugins?.Share) {
    try {
      const saved = await window.Capacitor.Plugins.Filesystem.writeFile({ path: fileName, data: contents, directory: 'CACHE', encoding: 'utf8' });
      await window.Capacitor.Plugins.Share.share({
        title: 'Sigurnosna kopija potrošnje struje',
        text: 'Sigurnosna kopija mjernih mjesta, očitanja i postavki aplikacije Moja potrošnja struje.',
        url: saved.uri,
        dialogTitle: 'Spremi ili podijeli sigurnosnu kopiju'
      });
      showToast('Sigurnosna kopija je pripremljena.');
      return;
    } catch {
      showToast('Sigurnosnu kopiju nije bilo moguće otvoriti za dijeljenje.');
      return;
    }
  }

  const blob = new Blob([contents], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('Sigurnosna kopija je izvezena.');
});

document.querySelector('#importInput').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return showToast('Datoteka nije odabrana.');

  try {
    const imported = parseBackup(await readBackupFile(file));
    const migrated = migrateState(imported, DEFAULT_RATES, BUNDLED_TARIFF_META);
    const importedCount = countReadings(migrated);
    if (!window.confirm(`Uvesti ${importedCount} očitanja u ${migrated.meters.length} mjernih mjesta? Trenutačni podaci bit će zamijenjeni.`)) return;
    state.meters = migrated.meters;
    state.activeMeterId = migrated.activeMeterId;
    state.rates = migrated.rates;
    state.tariffVersion = migrated.tariffVersion;
    state.ratesEffectiveFrom = migrated.ratesEffectiveFrom;
    state.lastTariffCheck = migrated.lastTariffCheck;
    state.ratesCustomized = migrated.ratesCustomized;
    state.autoTariffCheck = migrated.autoTariffCheck;
    state.energyLimit = migrated.energyLimit;
    saveState();
    elements.filterFrom.value = '';
    elements.filterTo.value = '';
    render();
    resetForm();
    showToast(`Uspješno uvezeno ${importedCount} očitanja.`);
  } catch (error) {
    console.error('Greška pri uvozu sigurnosne kopije:', error);
    showToast(error?.message || 'Sigurnosnu kopiju nije moguće uvesti.');
  } finally {
    event.target.value = '';
  }
});

document.querySelector('#printBtn').addEventListener('click', async () => {
  try {
    await createReadingsPdf();
    showToast('PDF je pripremljen.');
  } catch (error) {
    console.error('Greška pri izradi PDF-a:', error);
    showToast(error?.message || 'PDF nije moguće izraditi.');
  }
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  elements.installBtn.classList.remove('hidden');
});

elements.installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  elements.installBtn.classList.add('hidden');
});

window.addEventListener('appinstalled', () => showToast('Aplikacija je instalirana.'));

if ('serviceWorker' in navigator && !IS_NATIVE && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

resetForm();
saveState();
render();
if (state.autoTariffCheck) checkForTariffUpdates();
