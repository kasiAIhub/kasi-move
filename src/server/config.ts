/** Server-only connection keys. Blank values use the truthful manual fallback. */
export interface Configuration {
  YOCO_SECRET_KEY?: string;
  YOCO_WEBHOOK_SECRET?: string;
  SUPPORT_WHATSAPP?: string;
  CASH_SEND_NUMBER?: string;
  BANK_DETAILS?: string;
  STALL_PAYMENT_URL?: string;
  STALL_PAYMENT_INSTRUCTIONS?: string;
  ACTIVATION_ADMIN_KEY?: string;
  ALLOW_ALCOHOL_TESTING?: string;
}
export function apiConfiguration(env: Configuration) {
  return { paymentUrl: env.STALL_PAYMENT_URL, paymentInstructions: env.STALL_PAYMENT_INSTRUCTIONS,
    yocoKey: env.YOCO_SECRET_KEY, yocoWebhookSecret: env.YOCO_WEBHOOK_SECRET,
    supportPhone: env.SUPPORT_WHATSAPP, cashSendNumber: env.CASH_SEND_NUMBER, bankDetails: env.BANK_DETAILS,
    activationKey: env.ACTIVATION_ADMIN_KEY, alcoholTesting: env.ALLOW_ALCOHOL_TESTING === 'true',
    manualCodes: true };
}
