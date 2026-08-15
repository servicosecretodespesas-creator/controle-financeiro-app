/**
 * Standard CRC-16 CCITT (False) calculation for BR Code / Pix
 */
export function getCRC16(payload: string): string {
  let crc = 0xFFFF;
  const polynomial = 0x1021;

  for (let i = 0; i < payload.length; i++) {
    const byte = payload.charCodeAt(i);
    crc ^= (byte << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatEMVField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function cleanString(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-zA-Z0-9 ]/g, '') // remove special chars
    .toUpperCase();
}

export interface PixData {
  key: string;
  amount: number;
  receiverName: string;
  city?: string;
  description?: string;
  txid?: string;
  keyType?: string;
}

/**
 * Generates a valid Pix "Copia e Cola" string compatible with all Brazilian bank apps.
 */
export function generatePixPayload(data: PixData): string {
  const gui = formatEMVField('00', 'br.gov.bcb.pix');
  
  let cleanedKey = data.key.trim();
  const kType = (data.keyType || '').toUpperCase();

  // Normalize phone/celular keys to international format (e.g. +55DD9XXXXXXXX)
  if (kType === 'CELULAR' || kType === 'CELULAR (TELEFONE)' || (!kType && cleanedKey.includes('+')) || (!kType && /^[0-9+()-\s]+$/.test(cleanedKey) && cleanedKey.replace(/\D/g, '').length >= 10 && cleanedKey.replace(/\D/g, '').length <= 11)) {
    let digitsOnly = cleanedKey.replace(/\D/g, '');
    if (digitsOnly.length === 10 || digitsOnly.length === 11) {
      // Add Brazil country code (+55) if it's a standard Brazilian number of 10 or 11 digits
      cleanedKey = `+55${digitsOnly}`;
    } else if (digitsOnly.length === 12 || digitsOnly.length === 13) {
      // If it already has country code (like 55...) but is missing the '+' prefix
      if (digitsOnly.startsWith('55')) {
        cleanedKey = `+${digitsOnly}`;
      } else {
        cleanedKey = `+${digitsOnly}`;
      }
    } else {
      cleanedKey = cleanedKey.replace(/[\s()-]/g, '');
      if (!cleanedKey.startsWith('+')) {
        cleanedKey = '+' + cleanedKey;
      }
    }
  } else if (kType === 'CPF' || (!kType && /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(cleanedKey))) {
    cleanedKey = cleanedKey.replace(/\D/g, '');
  } else if (kType === 'CNPJ' || (!kType && /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(cleanedKey))) {
    cleanedKey = cleanedKey.replace(/\D/g, '');
  }

  const keyField = formatEMVField('01', cleanedKey);
  let merchantAccountInfoValue = gui + keyField;
  
  if (data.description) {
    const cleanedDesc = cleanString(data.description).slice(0, 72);
    if (cleanedDesc.length > 0) {
      merchantAccountInfoValue += formatEMVField('02', cleanedDesc);
    }
  }
  
  const merchantAccountInfo = formatEMVField('26', merchantAccountInfoValue);
  const merchantCategoryCode = formatEMVField('52', '0000');
  const transactionCurrency = formatEMVField('53', '986'); // BRL
  
  // Format amount to 2 decimal places (must use . as decimal separator)
  const formattedAmount = data.amount.toFixed(2);
  const transactionAmount = formatEMVField('54', formattedAmount);
  
  const countryCode = formatEMVField('58', 'BR');
  
  const rawName = cleanString(data.receiverName || 'TITULAR');
  const receiverName = formatEMVField('59', rawName.slice(0, 25).trim() || 'TITULAR');
  
  const rawCity = cleanString(data.city || 'MANAUS');
  const city = formatEMVField('60', rawCity.slice(0, 15).trim() || 'MANAUS');
  
  let txidValue = '***';
  if (data.txid && data.txid !== '***') {
    const cleanedTx = cleanString(data.txid).replace(/\s/g, '');
    if (cleanedTx) {
      txidValue = cleanedTx.slice(0, 25);
    }
  }
  const additionalData = formatEMVField('62', formatEMVField('05', txidValue));
  
  const payloadBeforeCRC = '000201' +
    merchantAccountInfo +
    merchantCategoryCode +
    transactionCurrency +
    transactionAmount +
    countryCode +
    receiverName +
    city +
    additionalData +
    '6304';
    
  const crc = getCRC16(payloadBeforeCRC);
  return payloadBeforeCRC + crc;
}

/**
 * Returns a URL for the QR Code image representing the payload
 */
export function getPixQRCodeUrl(payload: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payload)}`;
}
