import QRCode from "qrcode";

/**
 * Generate a mock eSIM activation QR code.
 *
 * Real eSIM QR codes contain an LPA (Local Profile Assistant) string like:
 *   LPA:1$smdp.example.com$ACTIVATION-CODE-HERE
 *
 * We generate a realistic-looking but fake LPA string using the order ref.
 *
 * @param orderRef - The order reference (e.g. ESIM-1234567890-abc123)
 * @returns An object with the QR code data URL and the activation code string
 */
export async function generateEsimQR(orderRef: string): Promise<{
  qr_data_url: string;
  activation_code: string;
}> {
  const activationCode = `LPA:1$smdp.xagenpay.com$${orderRef.toUpperCase()}`;

  const qrDataUrl = await QRCode.toDataURL(activationCode, {
    width: 300,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
    errorCorrectionLevel: "M",
  });

  return {
    qr_data_url: qrDataUrl,
    activation_code: activationCode,
  };
}
