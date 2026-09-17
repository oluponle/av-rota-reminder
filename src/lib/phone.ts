export type PhoneNormalizationResult =
  | { ok: true; e164: string }
  | { ok: false; error: string };

// UK mobile numbers: national number is "7" followed by a second digit in
// the valid mobile ranges 071-075 and 077-079 (070 is personal numbering,
// 076 is pagers -- neither is a mobile range), then 8 more digits.
const UK_MOBILE_E164_REGEX = /^\+447[1-57-9]\d{8}$/;

/**
 * Normalises a UK phone number in whatever reasonable format someone typed
 * it in a spreadsheet (07960357473, 7960357473, 447960357473,
 * +447960357473, with spaces/dashes) to strict E.164 (+447960357473).
 *
 * Returns a result object rather than throwing so callers can surface a
 * clear per-person problem without crashing the whole reminder run.
 */
export function normalizeUkPhoneNumber(raw: string): PhoneNormalizationResult {
  const original = raw.trim();
  if (!original) {
    return { ok: false, error: "Phone number is empty." };
  }

  // Strip everything except digits and a leading "+", rather than a
  // curated list of separator characters. Spreadsheet phone numbers are
  // often copy-pasted from contact apps/exports, which can leave invisible
  // characters behind (zero-width space/non-joiner, RTL/LTR marks, etc.)
  // that render as nothing but aren't whitespace, so a narrower allowlist
  // silently breaks on them while looking identical in any error message.
  const cleaned = original.replace(/[^\d+]/g, "");

  let nationalNumber: string;
  if (cleaned.startsWith("+44")) {
    nationalNumber = cleaned.slice(3);
  } else if (cleaned.startsWith("0044")) {
    nationalNumber = cleaned.slice(4);
  } else if (cleaned.startsWith("44") && cleaned.length === 12) {
    nationalNumber = cleaned.slice(2);
  } else if (cleaned.startsWith("0")) {
    nationalNumber = cleaned.slice(1);
  } else {
    nationalNumber = cleaned;
  }

  const e164 = `+44${nationalNumber}`;

  if (!UK_MOBILE_E164_REGEX.test(e164)) {
    return {
      ok: false,
      error: `"${original}" does not look like a valid UK mobile number.`,
    };
  }

  return { ok: true, e164 };
}
