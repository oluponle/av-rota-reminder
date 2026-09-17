"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { getRotaProvider } from "@/lib/rota";
import { resolveRotaAssignment, type ResolvedAssignment } from "@/lib/rota/assignment";
import { getMessagingProvider } from "@/lib/messaging";
import { getMessageLogStore } from "@/lib/message-log";
import { normalizeUkPhoneNumber } from "@/lib/phone";
import { formatFriendlySundayDate } from "@/lib/london-time";
import {
  computeTargetDate,
  processReminder,
  processSundayAdvance,
  runScheduledReminders,
  type AdminNotificationOutcome,
  type ProductionReminderType,
  type ReminderOutcome,
} from "@/lib/reminders/processor";

const REMINDER_LABEL: Record<ProductionReminderType, string> = {
  SUNDAY_ADVANCE: "Sunday advance notice",
  FRIDAY_REMINDER: "Friday reminder",
};

function describePreview(
  reminderType: ProductionReminderType,
  assignment: ResolvedAssignment
): string {
  const label = REMINDER_LABEL[reminderType];
  const dateStr = formatFriendlySundayDate(assignment.dutyDate);
  if (assignment.problem) {
    return `${label} for ${dateStr}: ${assignment.problem}`;
  }
  return `${label} for ${dateStr}: would message ${assignment.personName} at ${assignment.phoneE164}.`;
}

function describeOutcome(outcome: ReminderOutcome): string {
  const label = REMINDER_LABEL[outcome.reminderType];
  const dateStr = formatFriendlySundayDate(outcome.dutyDate);
  const prefix = `${label} for ${dateStr}`;

  switch (outcome.status) {
    case "sent":
      return `${prefix}: sent to ${outcome.personName} (${outcome.phoneE164}), message id ${outcome.providerMessageId ?? "n/a"}.`;
    case "failed":
      return `${prefix}: FAILED to send to ${outcome.personName} (${outcome.phoneE164}) -- ${outcome.errorMessage}`;
    case "already_sent":
      return `${prefix}: already sent to ${outcome.personName} previously -- skipped.`;
    case "blocked":
      return `${prefix}: not sent -- ${outcome.errorMessage}`;
  }
}

function describeAdminOutcome(outcome: AdminNotificationOutcome): string {
  const dateStr = formatFriendlySundayDate(outcome.dutyDate);
  const prefix = `Admin notification for ${dateStr} (${outcome.personName})`;

  switch (outcome.status) {
    case "sent":
      return `${prefix}: sent, message id ${outcome.providerMessageId ?? "n/a"}.`;
    case "failed":
      return `${prefix}: FAILED -- ${outcome.errorMessage}`;
    case "already_sent":
      return `${prefix}: already sent previously -- skipped.`;
    case "blocked":
      return `${prefix}: not sent -- ${outcome.errorMessage}`;
  }
}

export async function testSheetsConnectivity(): Promise<string> {
  await requireAdminSession();
  const provider = getRotaProvider();
  const [rota, team] = await Promise.all([
    provider.getRota(),
    provider.getTeam(),
  ]);
  return `Connected. Rota sheet has ${rota.length} row(s); Team sheet has ${team.length} member(s).`;
}

export async function previewReminder(
  reminderType: ProductionReminderType
): Promise<string> {
  await requireAdminSession();
  const provider = getRotaProvider();
  const dutyDate = computeTargetDate(reminderType);
  const assignment = await resolveRotaAssignment(provider, dutyDate);
  return describePreview(reminderType, assignment);
}

/** Sends a fixed test SMS to the configured admin number
 *  (ADMIN_PHONE_NUMBER), to verify Twilio SMS end-to-end without
 *  needing to type a number in each time. */
export async function sendTestSms(): Promise<string> {
  await requireAdminSession();
  const adminNumberRaw = process.env.ADMIN_PHONE_NUMBER;
  if (!adminNumberRaw) {
    return "Not sent: the admin phone number is not configured.";
  }

  const normalized = normalizeUkPhoneNumber(adminNumberRaw);
  if (!normalized.ok) {
    return `Not sent: ${normalized.error}`;
  }

  const messaging = getMessagingProvider();
  const result = await messaging.sendSMS(
    normalized.e164,
    "[TEST] This is a test message from AV Rota Reminder."
  );

  const messageLog = getMessageLogStore();
  await messageLog.appendEntry({
    dutyDate: "",
    person: "",
    phone: normalized.e164,
    reminderType: "TEST",
    status: result.success ? "SENT" : "FAILED",
    sentAt: new Date().toISOString(),
    providerMessageId: result.providerMessageId ?? "",
    error: result.errorMessage ?? "",
    isTest: true,
  });

  revalidatePath("/");

  return result.success
    ? `Sent to ${normalized.e164} (message id ${result.providerMessageId}).`
    : `Failed to send to ${normalized.e164}: ${result.errorMessage}`;
}

/** Exercises the full Sunday flow (person reminder + admin notification),
 *  both marked as test sends so neither counts towards production
 *  duplicate-protection. */
export async function triggerTestSundayAdvance(): Promise<string> {
  await requireAdminSession();
  const dutyDate = computeTargetDate("SUNDAY_ADVANCE");
  const { reminder, adminNotification } = await processSundayAdvance({
    dutyDate,
    isTest: true,
  });
  revalidatePath("/");

  const parts = [describeOutcome(reminder)];
  if (adminNotification) parts.push(describeAdminOutcome(adminNotification));
  return parts.join(" | ");
}

export async function triggerTestFridayReminder(): Promise<string> {
  await requireAdminSession();
  const dutyDate = computeTargetDate("FRIDAY_REMINDER");
  const outcome = await processReminder({
    reminderType: "FRIDAY_REMINDER",
    dutyDate,
    isTest: true,
  });
  revalidatePath("/");
  return describeOutcome(outcome);
}

export async function runScheduledCheckNow(): Promise<string> {
  await requireAdminSession();
  const { ran, results, adminNotifications } = await runScheduledReminders(
    new Date()
  );
  revalidatePath("/");

  if (ran.length === 0) {
    return "Not due right now -- production reminders only send at Sunday 19:00 or Friday 18:00 Europe/London.";
  }

  return [
    ...results.map(describeOutcome),
    ...adminNotifications.map(describeAdminOutcome),
  ].join(" | ");
}
