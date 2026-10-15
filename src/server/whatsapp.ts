export interface WhatsApp {
  configured?: boolean;
  notifyShop?(phone: string, stall: string, items: string): Promise<void>;
  notifyOrder?(phone: string, customer: string): Promise<void>;
  sendCode(phone: string): Promise<void>;
  checkCode(phone: string, code: string): Promise<boolean>;
  sendRiderInvite(phone: string, stallName: string, token: string): Promise<void>;
}
export interface WhatsAppConfig {
  META_WHATSAPP_TOKEN?: string;
  META_WHATSAPP_PHONE_NUMBER_ID?: string;
  META_WEBHOOK_VERIFY_TOKEN?: string;
  META_APP_SECRET?: string;
  META_WHATSAPP_WABA_ID?: string;
  META_TEST_RECIPIENT?: string;
  WHATSAPP_MODE?: string;
}
// Authentication stays in Kasi Move. Invitations keep their manual share flow.
export function whatsapp(_config: WhatsAppConfig): WhatsApp {
  return {
    configured: false,
    async sendCode() { throw new Error('Request a code from Thandi.'); },
    async checkCode() { throw new Error('WhatsApp is not connected yet.'); },
    async sendRiderInvite() { throw new Error('Use the prepared WhatsApp invitation.'); },
  };
}
