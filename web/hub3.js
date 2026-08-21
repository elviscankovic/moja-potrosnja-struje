const HUB3_HEADER = 'HRVHUB30';
const CURRENCY = 'EUR';

function parseMonth(value, label = 'mjesec obveze') {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value ?? ''));
  if (!match) throw new Error(`Neispravan ${label}.`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

function clean(value, maxLength) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function required(value, label) {
  if (!String(value ?? '').trim()) throw new Error(`Nedostaje podatak: ${label}.`);
}

export function amountToHub3(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Iznos za plaćanje mora biti veći od 0 €.');
  // HUB3 iznos je 15 znamenki, u centima, bez decimalnog separatora.
  const cents = Math.round((value + Number.EPSILON) * 100);
  const encoded = String(cents).padStart(15, '0');
  if (encoded.length > 15) throw new Error('Iznos je prevelik za HUB3 zapis.');
  return encoded;
}

// FINA MOD11INI: znamenke se ponderiraju zdesna nalijevo, počevši s 2.
// Kod ostatka 0 ili 1 kontrolna znamenka je 0, inače je 11 - ostatak.
export function calculateMod11Ini(value) {
  const digits = String(value ?? '').replace(/-/g, '');
  if (!/^\d+$/.test(digits)) throw new Error('Podatak za kontrolnu znamenku mora sadržavati samo brojeve.');

  let sum = 0;
  let weight = 2;
  for (let index = digits.length - 1; index >= 0; index -= 1, weight += 1) {
    sum += Number(digits[index]) * weight;
  }

  const remainder = sum % 11;
  return remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
}

export function monthDifference(fromMonth, toMonth) {
  const from = parseMonth(fromMonth, 'polazišni mjesec');
  const to = parseMonth(toMonth, 'odabrani mjesec');
  return (to.year - from.year) * 12 + to.month - from.month;
}

export function sequenceForMonth(anchorMonth, anchorSequence, targetMonth) {
  const sequence = Number(anchorSequence) + monthDifference(anchorMonth, targetMonth);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 99) {
    throw new Error('Redni broj obveze nije moguće automatski odrediti. Provjeri postavke plaćanja.');
  }
  return sequence;
}

export function buildHepReference({ contractAccount, month, sequence }) {
  const account = String(contractAccount ?? '').trim();
  if (!/^\d{1,12}$/.test(account)) throw new Error('Ugovorni račun mora sadržavati samo brojeve.');

  const parsedMonth = parseMonth(month);
  const sequenceNumber = Number(sequence);
  if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1 || sequenceNumber > 99) {
    throw new Error('Redni broj obveze mora biti između 1 i 99.');
  }

  const periodAndSequence = `${String(parsedMonth.year).slice(-2)}${String(parsedMonth.month).padStart(2, '0')}${String(sequenceNumber).padStart(2, '0')}`;
  const checkDigit = calculateMod11Ini(`${account}${periodAndSequence}`);
  return `${account}-${periodAndSequence}-${checkDigit}`;
}

export function validatePaymentData(data) {
  required(data.payerName, 'ime i prezime / naziv platitelja');
  required(data.payerAddress, 'adresa platitelja');
  required(data.payerCity, 'mjesto platitelja');
  required(data.receiverName, 'naziv primatelja');
  required(data.receiverAddress, 'adresa primatelja');
  required(data.receiverCity, 'mjesto primatelja');
  required(data.iban, 'IBAN primatelja');
  required(data.model, 'model');
  required(data.reference, 'poziv na broj');
  required(data.description, 'opis plaćanja');

  const iban = String(data.iban).replace(/\s+/g, '').toUpperCase();
  if (!/^HR\d{19}$/.test(iban)) throw new Error('IBAN primatelja nije u ispravnom hrvatskom formatu.');
  if (!/^HR\d{2}$/.test(String(data.model).trim().toUpperCase())) throw new Error('Model mora biti u obliku HRxx, npr. HR01.');
  amountToHub3(data.amount);
  return true;
}

export function buildHub3Payload(data) {
  validatePaymentData(data);

  const iban = String(data.iban).replace(/\s+/g, '').toUpperCase();
  const model = String(data.model).trim().toUpperCase();

  // HUB3/PDF417: svako polje završava LF znakom. Prazna šifra namjene je dopuštena.
  const fields = [
    HUB3_HEADER,
    CURRENCY,
    amountToHub3(data.amount),
    clean(data.payerName, 30),
    clean(data.payerAddress, 27),
    clean(data.payerCity, 27),
    clean(data.receiverName, 25),
    clean(data.receiverAddress, 25),
    clean(data.receiverCity, 27),
    iban,
    model,
    clean(data.reference, 22),
    clean(data.purposeCode, 4),
    clean(data.description, 35)
  ];

  return `${fields.join('\n')}\n`;
}

export const HUB3_CONSTANTS = Object.freeze({ header: HUB3_HEADER, currency: CURRENCY });
