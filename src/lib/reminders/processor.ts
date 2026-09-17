import "server-only";
import { getMessagingProvider } from "@/lib/messaging";
import { getRotaProvider } from "@/lib/rota";
import { resolveRotaAssignment } from "@/lib/rota/assignment";
import { getMessageLogStore } from "@/lib/message-log";
import type { ReminderType } from "@/lib/message-log";
import { normalizeUkPhoneNumber } from "@/lib/phone";
import {
  getLondonNow,
  nextSunday,
  isWithinMinutesOfHour,
  formatFriendlySundayDate,
  type LondonNow,
} from "@/lib/london-time";

// Vercel Hobby crons can only run at a fixed UTC time, once a week, so they
// can't track the GMT/BST change themselves (see vercel.json and README).
// The schedule is set to the midpoint between each season's equivalent UTC
// time, which lands within ~30 minutes of the true London target either
// way -- this window just needs to be wide enough to not miss that.
const DUE_WINDOW_MINUTES = 60;

/** The two reminder types that are tied to a specific Sunday duty. ADMIN is
 *  handled separately (see sendAdminNotification/processSundayAdvance
 *  below); the standalone "TEST" message kind (ad-hoc test send) is handled
 *  separately again in src/lib/actions/admin.ts and never goes through this
 *  function. */
export type ProductionReminderType = Extract<
  ReminderType,
  "SUNDAY_ADVANCE" | "FRIDAY_REMINDER"
>;

export type ReminderOutcomeStatus =
  | "sent"
  | "failed"
  | "already_sent"
  | "blocked";

export interface ReminderOutcome {
  reminderType: ProductionReminderType;
  dutyDate: string;
  isTest: boolean;
  personName: string | null;
  phoneE164: string | null;
  status: ReminderOutcomeStatus;
  providerMessageId?: string;
  errorMessage?: string;
}

export interface AdminNotificationOutcome {
  dutyDate: string;
  personName: string;
  isTest: boolean;
  status: ReminderOutcomeStatus;
  providerMessageId?: string;
  errorMessage?: string;
}

// Twilio Content template SIDs (WhatsApp Utility templates), one per
// person-facing reminder type. "1" = first name, "2" = friendly duty date,
// matching the approved template copy exactly -- see README.
const REMINDER_CONTENT_SID_ENV: Record<ProductionReminderType, string> = {
  SUNDAY_ADVANCE: "TWILIO_SUNDAY_CONTENT_SID",
  FRIDAY_REMINDER: "TWILIO_FRIDAY_CONTENT_SID",
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
}

function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

/**
 * Which Sunday a reminder type targets, computed from a London calendar
 * date (defaults to "today" in Europe/London). SUNDAY_ADVANCE always looks
 * a full week ahead (even if today is itself a Sunday); FRIDAY_REMINDER
 * looks at the soonest coming Sunday.
 */
export function computeTargetDate(
  reminderType: ProductionReminderType,
  referenceISODate?: string
): string {
  const base = referenceISODate ?? getLondonNow().date;
  return reminderType === "SUNDAY_ADVANCE"
    ? nextSunday(base, { strictlyAfter: true })
    : nextSunday(base, { strictlyAfter: false });
}

/**
 * Resolves the recipient from the live Google Sheet and sends (or records
 * why it couldn't send) one reminder, using the approved WhatsApp Content
 * template for that reminder type.
 *
 * Idempotency: MessageLog is read for an existing SENT row matching
 * (reminderType, dutyDate, person) among *production* rows (isTest=false)
 * before sending; a previously-FAILED row is retried and simply appended
 * again (the log is append-only, so the most recent row per key is what
 * matters). Test sends (isTest: true) are logged the same way but never
 * consulted for this check.
 *
 * Concurrency note: Google Sheets has no transactions, so there is an
 * unavoidable check-then-send race if two invocations run at the same
 * moment (e.g. the cron firing while an admin also clicks a test button).
 * This is a low-volume, twice-a-week job, so rather than adding a database
 * purely for locking, the check is kept immediately before the send (no
 * other awaited work in between) to keep that window as small as
 * practical.
 */
export async function processReminder(params: {
  reminderType: ProductionReminderType;
  dutyDate: string;
  isTest: boolean;
}): Promise<ReminderOutcome> {
  const { reminderType, dutyDate, isTest } = params;
  const messageLog = getMessageLogStore();
  const rotaProvider = getRotaProvider();

  const assignment = await resolveRotaAssignment(rotaProvider, dutyDate);

  if (!assignment.personName || !assignment.phoneE164) {
    return {
      reminderType,
      dutyDate,
      isTest,
      personName: assignment.personName,
      phoneE164: null,
      status: "blocked",
      errorMessage: assignment.problem ?? "Could not resolve a recipient.",
    };
  }

  if (!isTest) {
    const entries = await messageLog.getEntries();
    const alreadySent = entries.some(
      (e) =>
        !e.isTest &&
        e.reminderType === reminderType &&
        e.dutyDate === dutyDate &&
        e.person === assignment.personName &&
        e.status === "SENT"
    );

    if (alreadySent) {
      return {
        reminderType,
        dutyDate,
        isTest,
        personName: assignment.personName,
        phoneE164: assignment.phoneE164,
        status: "already_sent",
      };
    }
  }

  const contentSid = getRequiredEnv(REMINDER_CONTENT_SID_ENV[reminderType]);
  const firstName = firstNameOf(assignment.personName);
  const variables = {
    "1": isTest ? `[TEST] ${firstName}` : firstName,
    "2": formatFriendlySundayDate(dutyDate),
  };

  const messaging = getMessagingProvider();
  const sendResult = await messaging.sendWhatsAppTemplate(
    assignment.phoneE164,
    contentSid,
    variables
  );

  await messageLog.appendEntry({
    dutyDate,
    person: assignment.personName,
    phone: assignment.phoneE164,
    reminderType,
    status: sendResult.success ? "SENT" : "FAILED",
    sentAt: new Date().toISOString(),
    providerMessageId: sendResult.providerMessageId ?? "",
    error: sendResult.errorMessage ?? "",
    isTest,
  });

  return {
    reminderType,
    dutyDate,
    isTest,
    personName: assignment.personName,
    phoneE164: assignment.phoneE164,
    status: sendResult.success ? "sent" : "failed",
    providerMessageId: sendResult.providerMessageId,
    errorMessage: sendResult.errorMessage,
  };
}

/**
 * Sends the admin "who's on duty next Sunday" notification via the
 * `adminnotification` Content template. Deliberately tolerant of missing
 * admin-specific config (ADMIN_WHATSAPP_NUMBER / TWILIO_ADMIN_CONTENT_SID)
 * -- returns "blocked" rather than throwing, so a broken admin notification
 * never prevents the team member's own reminder (sent separately, first)
 * from going out.
 *
 * Has its own duplicate-protection key (reminderType "ADMIN", dutyDate,
 * person) so retrying the Sunday job never re-notifies the admin about a
 * duty that's already been announced, independent of the per-person
 * reminder's own SENT/FAILED state.
 */
export async function sendAdminNotification(params: {
  dutyDate: string;
  personName: string;
  isTest: boolean;
}): Promise<AdminNotificationOutcome> {
  const { dutyDate, personName, isTest } = params;
  const messageLog = getMessageLogStore();

  const adminNumberRaw = process.env.ADMIN_WHATSAPP_NUMBER;
  if (!adminNumberRaw) {
    return {
      dutyDate,
      personName,
      isTest,
      status: "blocked",
      errorMessage: "ADMIN_WHATSAPP_NUMBER is not configured.",
    };
  }

  const normalizedAdminNumber = normalizeUkPhoneNumber(adminNumberRaw);
  if (!normalizedAdminNumber.ok) {
    return {
      dutyDate,
      personName,
      isTest,
      status: "blocked",
      errorMessage: `ADMIN_WHATSAPP_NUMBER is invalid: ${normalizedAdminNumber.error}`,
    };
  }

  if (!isTest) {
    const entries = await messageLog.getEntries();
    const alreadySent = entries.some(
      (e) =>
        !e.isTest &&
        e.reminderType === "ADMIN" &&
        e.dutyDate === dutyDate &&
        e.person === personName &&
        e.status === "SENT"
    );

    if (alreadySent) {
      return { dutyDate, personName, isTest, status: "already_sent" };
    }
  }

  let contentSid: string;
  try {
    contentSid = getRequiredEnv("TWILIO_ADMIN_CONTENT_SID");
  } catch (error) {
    return {
      dutyDate,
      personName,
      isTest,
      status: "blocked",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  const firstName = firstNameOf(personName);
  const variables = {
    "1": isTest ? `[TEST] ${firstName}` : firstName,
    "2": formatFriendlySundayDate(dutyDate),
  };

  const messaging = getMessagingProvider();
  const sendResult = await messaging.sendWhatsAppTemplate(
    normalizedAdminNumber.e164,
    contentSid,
    variables
  );

  await messageLog.appendEntry({
    dutyDate,
    person: personName,
    phone: normalizedAdminNumber.e164,
    reminderType: "ADMIN",
    status: sendResult.success ? "SENT" : "FAILED",
    sentAt: new Date().toISOString(),
    providerMessageId: sendResult.providerMessageId ?? "",
    error: sendResult.errorMessage ?? "",
    isTest,
  });

  return {
    dutyDate,
    personName,
    isTest,
    status: sendResult.success ? "sent" : "failed",
    providerMessageId: sendResult.providerMessageId,
    errorMessage: sendResult.errorMessage,
  };
}

export interface SundayAdvanceOutcome {
  reminder: ReminderOutcome;
  /** null only when nobody could be resolved for the duty at all (so there
   *  is nothing meaningful to tell the admin). */
  adminNotification: AdminNotificationOutcome | null;
}

/**
 * The full Sunday-evening flow: send the team member their advance notice,
 * then separately tell the admin who's on duty -- regardless of whether the
 * person's own reminder succeeded, since the admin especially needs to know
 * if e.g. that person's phone number is invalid and they can't be reminded
 * automatically.
 */
export async function processSundayAdvance(params: {
  dutyDate: string;
  isTest: boolean;
}): Promise<SundayAdvanceOutcome> {
  const reminder = await processReminder({
    reminderType: "SUNDAY_ADVANCE",
    dutyDate: params.dutyDate,
    isTest: params.isTest,
  });

  const adminNotification = reminder.personName
    ? await sendAdminNotification({
        dutyDate: params.dutyDate,
        personName: reminder.personName,
        isTest: params.isTest,
      })
    : null;

  return { reminder, adminNotification };
}

export interface ScheduledRunResult {
  london: LondonNow;
  ran: ProductionReminderType[];
  results: ReminderOutcome[];
  adminNotifications: AdminNotificationOutcome[];
}

/**
 * The production entry point. Vercel Cron calls this once around 19:00 on
 * Sundays and once around 18:00 on Fridays (Europe/London, within
 * DUE_WINDOW_MINUTES) -- see vercel.json. It's still safe to call more
 * often (e.g. the dashboard's "Run scheduled check now"): it only actually
 * sends when the current Europe/London time is within that window, and
 * MessageLog's duplicate protection means an extra call within the window
 * never sends a reminder twice.
 */
export async function runScheduledReminders(
  now: Date = new Date()
): Promise<ScheduledRunResult> {
  const london = getLondonNow(now);
  const due: ProductionReminderType[] = [];

  if (
    london.weekday === 0 &&
    isWithinMinutesOfHour(london, 19, DUE_WINDOW_MINUTES)
  ) {
    due.push("SUNDAY_ADVANCE");
  }
  if (
    london.weekday === 5 &&
    isWithinMinutesOfHour(london, 18, DUE_WINDOW_MINUTES)
  ) {
    due.push("FRIDAY_REMINDER");
  }

  const results: ReminderOutcome[] = [];
  const adminNotifications: AdminNotificationOutcome[] = [];

  for (const reminderType of due) {
    const dutyDate = computeTargetDate(reminderType, london.date);

    if (reminderType === "SUNDAY_ADVANCE") {
      const { reminder, adminNotification } = await processSundayAdvance({
        dutyDate,
        isTest: false,
      });
      results.push(reminder);
      if (adminNotification) adminNotifications.push(adminNotification);
    } else {
      results.push(
        await processReminder({ reminderType, dutyDate, isTest: false })
      );
    }
  }

  return { london, ran: due, results, adminNotifications };
}
