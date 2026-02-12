/**
 * Generates a Pix EMV payload string for QR Code generation.
 * Based on BR Code / EMV standard for Pix payments.
 */

function pad(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

interface PixPayload {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amount: number;
  txId?: string;
  description?: string;
}

export function generatePixPayload({
  pixKey,
  merchantName,
  merchantCity,
  amount,
  txId = '***',
  description,
}: PixPayload): string {
  // Payload Format Indicator
  let payload = pad('00', '01');

  // Point of Initiation Method (12 = one-time)
  payload += pad('01', '12');

  // Merchant Account Information (Pix)
  const gui = pad('00', 'br.gov.bcb.pix');
  const key = pad('01', pixKey);
  const descField = description ? pad('02', description) : '';
  payload += pad('26', gui + key + descField);

  // Merchant Category Code
  payload += pad('52', '0000');

  // Transaction Currency (986 = BRL)
  payload += pad('53', '986');

  // Transaction Amount
  payload += pad('54', amount.toFixed(2));

  // Country Code
  payload += pad('58', 'BR');

  // Merchant Name (max 25 chars)
  payload += pad('59', merchantName.substring(0, 25));

  // Merchant City (max 15 chars)
  payload += pad('60', merchantCity.substring(0, 15));

  // Additional Data Field Template
  const txIdField = pad('05', txId);
  payload += pad('62', txIdField);

  // CRC16 placeholder + calculation
  payload += '6304';
  const checksum = crc16(payload);
  payload += checksum;

  return payload;
}

export const PIX_KEY = 'fb9842c9-2ceb-46bc-bd5b-52893a58094a';

export const PLAN_CONFIG = {
  professional: {
    name: 'Profissional',
    price: 97,
    limit: 1000,
    features: [
      '1.000 vídeos por mês',
      'Tudo do plano Gratuito',
      'Editor de Legendas com IA ✨',
      'Processamento prioritário',
      'Suporte por e-mail',
    ],
  },
  enterprise: {
    name: 'Empresarial',
    price: 297,
    limit: Infinity,
    features: [
      'Vídeos ilimitados',
      'Tudo do plano Profissional',
      'Andromeda META ADS',
      'Dashboard de Resultados',
      'Suporte prioritário 24/7',
      'API de integração',
    ],
  },
} as const;
