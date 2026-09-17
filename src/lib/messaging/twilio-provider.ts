import "server-only";
import twilio from "twilio";
import type { MessagingProvider, SendMessageResult } from "./types";

interface CreateMessageParams {
  from: string;
  to: string;
  body?: string;
  contentSid?: string;
  contentVariables?: string;
}

export class TwilioMessagingProvider implements MessagingProvider {
  private client: ReturnType<typeof twilio>;
  private smsFrom?: string;
  private whatsAppFrom: string;

  constructor(options: {
    accountSid: string;
    authToken: string;
    whatsAppFromNumber: string;
    /** Optional -- only WhatsApp is required for this MVP. */
    smsFromNumber?: string;
  }) {
    this.client = twilio(options.accountSid, options.authToken);
    this.smsFrom = options.smsFromNumber;
    this.whatsAppFrom = options.whatsAppFromNumber;
  }

  async sendSMS(to: string, body: string): Promise<SendMessageResult> {
    if (!this.smsFrom) {
      return {
        success: false,
        errorMessage:
          "SMS is not configured (TWILIO_SMS_FROM_NUMBER is not set); this MVP only sends WhatsApp reminders.",
      };
    }
    return this.createMessage({ from: this.smsFrom, to, body });
  }

  async sendWhatsApp(to: string, body: string): Promise<SendMessageResult> {
    return this.createMessage({
      from: `whatsapp:${this.whatsAppFrom}`,
      to: `whatsapp:${to}`,
      body,
    });
  }

  async sendWhatsAppTemplate(
    to: string,
    contentSid: string,
    variables: Record<string, string>
  ): Promise<SendMessageResult> {
    return this.createMessage({
      from: `whatsapp:${this.whatsAppFrom}`,
      to: `whatsapp:${to}`,
      contentSid,
      contentVariables: JSON.stringify(variables),
    });
  }

  private async createMessage(
    params: CreateMessageParams
  ): Promise<SendMessageResult> {
    try {
      const message = await this.client.messages.create(params);
      return { success: true, providerMessageId: message.sid };
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
