/** Public QR image URL for a UPI payment string (no extra npm dependency). */
export function upiQrImageUrl(upiDeepLink: string, size = 280): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(upiDeepLink)}`;
}
