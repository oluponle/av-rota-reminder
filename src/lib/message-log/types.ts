/** SUNDAY_ADVANCE / FRIDAY_REMINDER for the per-person duty reminders; ADMIN
 *  for the admin notification sent alongside a SUNDAY_ADVANCE run; TEST for
 *  the standalone "send a test SMS" control (not tied to a specific duty).
 *  Kept as the original SUNDAY_ADVANCE/FRIDAY_REMINDER identifiers (not
 *  shortened to SUNDAY/FRIDAY) so duplicate-protection matching still
 *  recognises rows already appended to a live MessageLog sheet. */
export type ReminderType =
  | "SUNDAY_ADVANCE"
  | "FRIDAY_REMINDER"
  | "ADMIN"
  | "TEST";
export type MessageStatus = "SENT" | "FAILED";

export interface MessageLogEntry {
  /** YYYY-MM-DD, or "" for a standalone test send with no associated duty. */
  dutyDate: string;
  person: string;
  phone: string;
  reminderType: ReminderType;
  status: MessageStatus;
  /** ISO timestamp of when this send was attempted. */
  sentAt: string;
  providerMessageId: string;
  error: string;
  /** true for anything triggered from the dashboard's test controls -- these
   *  rows must never count towards production duplicate-prevention. */
  isTest: boolean;
}

/**
 * Append-only log of reminder sends, backed by the "MessageLog" worksheet
 * in the same Google Spreadsheet as the Rota/Team data. This is the only
 * worksheet the app ever writes to.
 */
export interface MessageLogStore {
  getEntries(): Promise<MessageLogEntry[]>;
  appendEntry(entry: MessageLogEntry): Promise<void>;
}
