import "server-only";
import { TwilioMessagingProvider } from "./twilio-provider";
import type { MessagingProvider } from "./types";

export type { MessagingProvider, SendMessageResult } from "./types";

let provider: MessagingProvider | null = null;

/**
 * Factory for the active MessagingProvider. Swapping providers (e.g. for a
 * different vendor, or a fake in tests) means changing this function only --
 * nothing else in the app imports Twilio directly.
 */
export function getMessagingProvider(): MessagingProvider {
  if (provider) return provider;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const smsFromNumber = process.env.TWILIO_SMS_FROM_NUMBER;

  if (!accountSid || !authToken || !smsFromNumber) {
    throw new Error(
      "Missing Twilio environment variables (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM_NUMBER)."
    );
  }

  provider = new TwilioMessagingProvider({
    accountSid,
    authToken,
    smsFromNumber,
  });

  return provider;
}
