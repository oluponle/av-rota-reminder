export interface SendMessageResult {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

/**
 * Abstraction over the outbound messaging provider. Business logic (the
 * reminder processor) depends only on this interface, never on Twilio
 * directly, so the provider can be swapped or mocked without touching it.
 */
export interface MessagingProvider {
  sendSMS(to: string, body: string): Promise<SendMessageResult>;
}
