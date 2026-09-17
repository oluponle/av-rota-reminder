import "server-only";
import twilio from "twilio";
import type { MessagingProvider, SendMessageResult } from "./types";

export class TwilioMessagingProvider implements MessagingProvider {
  private client: ReturnType<typeof twilio>;
  private smsFrom: string;

  constructor(options: {
    accountSid: string;
    authToken: string;
    smsFromNumber: string;
  }) {
    this.client = twilio(options.accountSid, options.authToken);
    this.smsFrom = options.smsFromNumber;
  }

  async sendSMS(to: string, body: string): Promise<SendMessageResult> {
    try {
      const message = await this.client.messages.create({
        from: this.smsFrom,
        to,
        body,
      });
      return { success: true, providerMessageId: message.sid };
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
