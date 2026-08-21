import { DEFAULT_RATES, enrichReadings, formatDate, validateReading } from './calc.js';
import { buildHub3Payload } from './hub3.js';
import { parseBackup, readBackupFile } from './backup.js';
import bwipjs from './vendor/bwip-js-min.js';

const STORAGE_KEY = 'moja-potrosnja-struje-v1';
const EMPTY_PAYER = Object.freeze({ name: '', address: '', postalCode: '', city: '' });
const state = loadState();
const IS_NATIVE = Boolean(window.Capacitor?.isNativePlatform?.());
let deferredInstallPrompt = null;
let toastTimer = null;

const elements = {
  form: document.querySelector('#readingForm'),
  editingId: document.querySelector('#editingId'),
  date: document.querySelector('#readingDate'),
  vt: document.querySelector('#readingVt'),
  nt: document.querySelector('#readingNt'),
  note: document.querySelector('#readingNote'),
  error: document.querySelector('#formError'),
  saveBtn: document.querySelector('#saveReadingBtn'),
  cancelBtn: document.querySelector('#cancelEditBtn'),
  historyBody: document.querySelector('#historyBody'),
  emptyState: document.querySelector('#emptyState'),
  readingCount: document.querySelector('#readingCount'),
  chart: document.querySelector('#chart'),
  toast: document.querySelector('#toast'),
  installBtn: document.querySelector('#installBtn'),
  payerForm: document.querySelector('#payerForm'),
  payerName: document.querySelector('#payerName'),
  payerAddress: document.querySelector('#payerAddress'),
  payerPostalCode: document.querySelector('#payerPostalCode'),
  payerCity: document.querySelector('#payerCity'),
  generateTestBarcodeBtn: document.querySelector('#generateTestBarcodeBtn'),
  barcodeError: document.querySelector('#barcodeError'),
  barcodeBox: document.querySelector('#barcodeBox'),
  paymentBarcode: document.querySelector('#paymentBarcode')
};

const rateIds = Object.keys(DEFAULT_RATES);

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.readings)) throw new Error('Invalid state');
    return {
      readings: saved.readings,
      rates: { ...DEFAULT_RATES, ...(saved.rates || {}) },
      payer: { ...EMPTY_PAYER, ...(saved.payer || {}) }
    };
  } catch {
    return { readings: [], rates: { ...DEFAULT_RATES }, payer: { ...EMPTY_PAYER } };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function render() {
  const enriched = enrichReadings(state.readings, state.rates);
  renderSummary(enriched);
  renderHistory(enriched);
  renderChart(enriched);
  renderRates();
  renderPayer();
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
    document.querySelector('#billEnergy').textContent = euro(latest.bill.energy);
    document.querySelector('#billTransmission').textContent = euro(latest.bill.transmission);
    document.querySelector('#billDistribution').textContent = euro(latest.bill.distribution);
    document.querySelector('#billRenewable').textContent = euro(latest.bill.renewable);
    document.querySelector('#billFixed').textContent = euro(latest.bill.supply + latest.bill.metering);
    document.querySelector('#billSubtotal').textContent = euro(latest.bill.subtotal);
    document.querySelector('#billVat').textContent = euro(latest.bill.vat);
    document.querySelector('#billTotal').textContent = euro(latest.bill.total);
  }
}

function renderHistory(readings) {
  elements.historyBody.innerHTML = '';
  elements.emptyState.classList.toggle('hidden', readings.length > 0);
  elements.readingCount.textContent = `${readings.length} ${readings.length === 1 ? 'očitanje' : 'očitanja'}`;

  [...readings].reverse().forEach((item) => {
    const row = document.createElement('tr');
    const usage = item.usage
      ? `<strong>${number(item.usage.total)} kWh</strong><small>VT ${number(item.usage.vt)} · NT ${number(item.usage.nt)}</small>`
      : '<span class="baseline">Početno stanje</span>';
    const cost = item.bill ? `<strong>${euro(item.bill.total)}</strong><small>${item.months} mj.</small>` : '—';
    row.innerHTML = `
      <td data-label="Datum"><div class="cell-content"><strong>${formatDate(item.date)}</strong>${item.note ? `<small>${escapeHtml(item.note)}</small>` : ''}</div></td>
      <td data-label="Stanje"><div class="cell-content"><span>VT ${number(item.vt)}</span><small>NT ${number(item.nt)}</small></div></td>
      <td data-label="Potrošnja"><div class="cell-content">${usage}</div></td>
      <td data-label="Procjena"><div class="cell-content">${cost}</div></td>
      <td class="row-actions">
        <button class="icon-button edit-button" data-id="${item.id}" type="button" aria-label="Uredi očitanje">Uredi</button>
        <button class="icon-button danger delete-button" data-id="${item.id}" type="button" aria-label="Obriši očitanje">Obriši</button>
      </td>`;
    elements.historyBody.append(row);
  });
}

function renderChart(readings) {
  const periods = readings.filter((item) => item.usage).slice(-12);
  elements.chart.innerHTML = '';
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
        <div class="bar-part bar-nt" style="height:${ntHeight}%"></div>
      </div>
      <div class="chart-label">${new Intl.DateTimeFormat('hr-HR', { month: 'short', year: '2-digit' }).format(new Date(`${item.date}T12:00:00`))}</div>`;
    elements.chart.append(column);
  });
}

function renderRates() {
  rateIds.forEach((id) => {
    const input = document.querySelector(`#${id}`);
    if (input && document.activeElement !== input) input.value = state.rates[id];
  });
}

function renderPayer() {
  elements.payerName.value = state.payer.name || '';
  elements.payerAddress.value = state.payer.address || '';
  elements.payerPostalCode.value = state.payer.postalCode || '';
  elements.payerCity.value = state.payer.city || '';
}

function generateTestBarcode() {
  elements.barcodeError.classList.add('hidden');
  elements.barcodeBox.classList.add('hidden');
  try {
    const payload = buildHub3Payload({
      amount: 13.97,
      payerName: state.payer.name,
      payerAddress: state.payer.address,
      payerCity: `${state.payer.postalCode} ${state.payer.city}`.trim(),
      receiverName: 'HEP ELEKTRA D.O.O.',
      receiverAddress: 'ULICA GRADA VUKOVARA 37',
      receiverCity: '10000 ZAGREB',
      iban: 'HR4924070001500325331',
      model: 'HR01',
      reference: '2201425014-2609005-4',
      purposeCode: '',
      description: 'UGOVORNI RACUN 2201425014'
    });

    bwipjs.toCanvas(elements.paymentBarcode, {
      bcid: 'pdf417',
      text: payload,
      columns: 9,
      eclevel: 4,
      scale: 2,
      height: 3,
      includetext: false
    });
    elements.barcodeBox.classList.remove('hidden');
    elements.barcodeBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    elements.barcodeError.textContent = error?.message || 'Barkod nije moguće generirati.';
    elements.barcodeError.classList.remove('hidden');
  }
}

elements.generateTestBarcodeBtn.addEventListener('click', generateTestBarcode);

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const editingId = elements.editingId.value || null;
  const candidate = {
    id: editingId || uid(),
    date: elements.date.value,
    vt: Number(elements.vt.value),
    nt: Number(elements.nt.value),
    note: elements.note.value.trim()
  };
  const error = validateReading(candidate, state.readings, editingId);
  if (error) return showError(error);

  if (editingId) {
    const index = state.readings.findIndex((item) => item.id === editingId);
    state.readings[index] = candidate;
  } else {
    state.readings.push(candidate);
  }
  state.readings.sort((a, b) => a.date.localeCompare(b.date));
  saveState();
  render();
  resetForm();
  showToast(editingId ? 'Očitanje je izmijenjeno.' : 'Očitanje je spremljeno.');
});

elements.cancelBtn.addEventListener('click', resetForm);

elements.historyBody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  const item = state.readings.find((reading) => reading.id === button.dataset.id);
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
    state.readings = state.readings.filter((reading) => reading.id !== item.id);
    saveState();
    render();
    resetForm();
    showToast('Očitanje je obrisano.');
  }
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
  saveState();
  render();
  showToast('Cijene su spremljene i izračuni osvježeni.');
});

document.querySelector('#resetRatesBtn').addEventListener('click', () => {
  if (!window.confirm('Vratiti sve tarifne stavke na zadane vrijednosti?')) return;
  state.rates = { ...DEFAULT_RATES };
  saveState();
  render();
  showToast('Vraćene su zadane cijene.');
});

elements.payerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const payer = {
    name: elements.payerName.value.trim(),
    address: elements.payerAddress.value.trim(),
    postalCode: elements.payerPostalCode.value.trim(),
    city: elements.payerCity.value.trim()
  };
  if (!payer.name || !payer.address || !payer.postalCode || !payer.city) {
    return showToast('Popuni sve podatke platitelja.');
  }
  state.payer = payer;
  saveState();
  showToast('Podaci platitelja su spremljeni.');
});

document.querySelector('#exportBtn').addEventListener('click', async () => {
  const fileName = `potrosnja-struje-${today()}.json`;
  const contents = JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), ...state }, null, 2);

  if (IS_NATIVE && window.Capacitor?.Plugins?.Filesystem && window.Capacitor?.Plugins?.Share) {
    try {
      const saved = await window.Capacitor.Plugins.Filesystem.writeFile({
        path: fileName,
        data: contents,
        directory: 'CACHE',
        encoding: 'utf8'
      });
      await window.Capacitor.Plugins.Share.share({
        title: 'Sigurnosna kopija potrošnje struje',
        text: 'Sigurnosna kopija očitanja i postavki aplikacije Moja potrošnja struje.',
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

  if (!file) {
    showToast('Datoteka nije odabrana.');
    return;
  }

  try {
    const imported = parseBackup(await readBackupFile(file));

    if (!window.confirm(
      `Uvesti ${imported.readings.length} očitanja? Trenutačni podaci bit će zamijenjeni.`
    )) {
      return;
    }

    state.readings = imported.readings;
    state.rates = { ...DEFAULT_RATES, ...imported.rates };
    state.payer = { ...EMPTY_PAYER, ...(imported.payer || {}) };

    saveState();
    render();
    resetForm();

    showToast(`Uspješno uvezeno ${imported.readings.length} očitanja.`);
  } catch (error) {
    console.error('Greška pri uvozu sigurnosne kopije:', error);
    showToast(error?.message || 'Sigurnosnu kopiju nije moguće uvesti.');
  } finally {
    event.target.value = '';
  }
});

document.querySelector('#printBtn').addEventListener('click', () => window.print());

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
render();
