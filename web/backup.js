export function parseBackup(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Datoteka je prazna ili je nije moguće pročitati.');
  }

  let imported;
  try {
    imported = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('Datoteka nije ispravan JSON.');
  }

  const hasOldReadings = Array.isArray(imported?.readings);
  const hasMeters = Array.isArray(imported?.meters) && imported.meters.length > 0;
  if (!imported || (!hasOldReadings && !hasMeters) || !imported.rates || typeof imported.rates !== 'object') {
    throw new Error('JSON ne sadrži valjanu sigurnosnu kopiju.');
  }

  return imported;
}

export async function readBackupFile(file, FileReaderCtor = globalThis.FileReader) {
  if (!file) throw new Error('Datoteka nije odabrana.');

  if (typeof FileReaderCtor === 'function') {
    return new Promise((resolve, reject) => {
      const reader = new FileReaderCtor();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Datoteku nije moguće pročitati.'));
      reader.readAsText(file);
    });
  }

  if (typeof file.text === 'function') return file.text();

  throw new Error('Datoteku nije moguće pročitati.');
}
