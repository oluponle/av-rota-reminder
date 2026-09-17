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
  /** Free-form WhatsApp message (used only for the dashboard's ad-hoc
   *  "send a test WhatsApp" connectivity check). */
  sendWhatsApp(to: string, body: string): Promise<SendMessageResult>;
  /**
   * Sends a pre-approved WhatsApp template via Twilio's Content API
   * (ContentSid + ContentVariables), required for business-initiated
   * messages like scheduled reminders. `variables` maps a template's
   * placeholder numbers ("1", "2", ...) to their substitution values.
   */
  sendWhatsAppTemplate(
    to: string,
    contentSid: string,
    variables: Record<string, string>
  ): Promise<SendMessageResult>;
}
