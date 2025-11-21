import QRCode from 'qrcode';

export interface QROptions {
  size?: number;
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
}

export interface ContactQRData {
  version: string;
  id: string;
  identityPublic: string;
  preKeyPublic: string;
  preKeyId: number;
  timestamp: number;
  onionAddress?: string;
}

// Generate proper QR code as data URL
export async function generateQRCode(
  data: string,
  options: QROptions = {}
): Promise<string> {
  const size = options.size || 256;
  const errorCorrectionLevel = options.errorCorrection || 'M';

  try {
    const qrDataURL = await QRCode.toDataURL(data, {
      width: size,
      errorCorrectionLevel,
      type: 'image/png',
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrDataURL;
  } catch (error) {
    throw new Error(`Failed to generate QR code: ${error}`);
  }
}

// Generate SVG-based QR code
export async function generateQRCodeSVG(
  data: string,
  size: number = 256,
  errorCorrection: 'L' | 'M' | 'Q' | 'H' = 'M'
): Promise<string> {
  try {
    const qrSVG = await QRCode.toString(data, {
      type: 'svg',
      width: size,
      errorCorrectionLevel: errorCorrection,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return 'data:image/svg+xml;base64,' + btoa(qrSVG);
  } catch (error) {
    throw new Error(`Failed to generate QR SVG: ${error}`);
  }
}

// Generate contact data for QR
export function generateContactQRData(
  identityPublic: string,
  preKeyPublic: string,
  preKeyId: number
): ContactQRData {
  return {
    version: 'anonchat:1',
    id: generateContactId(),
    identityPublic,
    preKeyPublic,
    preKeyId,
    timestamp: Date.now(),
  };
}

// Parse QR contact data
export function parseContactQRData(jsonString: string): ContactQRData {
  const data = JSON.parse(jsonString);
  
  if (!data.version || !data.id || !data.identityPublic || !data.preKeyPublic) {
    throw new Error('Invalid QR contact data');
  }

  return data;
}

// Encode contact data to string for QR
export function encodeContactQR(contactData: ContactQRData): string {
  const jsonData = JSON.stringify(contactData);
  // Create a URL that can be opened in browser and handled by the app
  // Use current origin for local development, fallback for production
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const encodedData = encodeURIComponent(jsonData);
  const qrUrl = `${baseUrl}/add-contact?data=${encodedData}`;

  console.log('🔗 Generated QR URL:', qrUrl);
  console.log('📊 Contact Data:', contactData);

  return qrUrl;
}

// Generate unique contact ID
function generateContactId(): string {
  return 'contact_' + Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Simple hash function for pattern generation
function hashData(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
