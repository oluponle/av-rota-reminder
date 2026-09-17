import "server-only";
import {
  sheetsAddSheet,
  sheetsGetSheetTitles,
  sheetsValuesAppend,
  sheetsValuesGet,
  sheetsValuesUpdate,
} from "@/lib/google-sheets/client";
import { cellToBool, cellToText } from "@/lib/google-sheets/cells";
import type {
  MessageLogEntry,
  MessageLogStore,
  MessageStatus,
  ReminderType,
} from "./types";

const SHEET_NAME = "MessageLog";
const HEADER = [
  "DutyDate",
  "Person",
  "Phone",
  "ReminderType",
  "Status",
  "SentAt",
  "ProviderMessageId",
  "Error",
  "IsTest",
];
const HEADER_RANGE = `${SHEET_NAME}!A1:I1`;
const DATA_RANGE = `${SHEET_NAME}!A2:I`;
const APPEND_RANGE = `${SHEET_NAME}!A:I`;

export class GoogleSheetsMessageLog implements MessageLogStore {
  private ensured = false;

  /** Creates the MessageLog worksheet + header row if they don't exist yet.
   *  Cached per warm instance so repeated calls in one process don't
   *  re-check the spreadsheet's worksheet list every time. */
  private async ensureSheet(): Promise<void> {
    if (this.ensured) return;

    const titles = await sheetsGetSheetTitles();
    if (!titles.includes(SHEET_NAME)) {
      await sheetsAddSheet(SHEET_NAME);
      await sheetsValuesUpdate(HEADER_RANGE, HEADER);
    }

    this.ensured = true;
  }

  async getEntries(): Promise<MessageLogEntry[]> {
    await this.ensureSheet();
    const rows = await sheetsValuesGet(DATA_RANGE);
    const entries: MessageLogEntry[] = [];

    for (const row of rows) {
      const person = cellToText(row[1]);
      if (!person) continue; // skip blank trailing rows

      entries.push({
        dutyDate: cellToText(row[0]),
        person,
        phone: cellToText(row[2]),
        reminderType: (cellToText(row[3]) || "TEST") as ReminderType,
        status: (cellToText(row[4]) || "FAILED") as MessageStatus,
        sentAt: cellToText(row[5]),
        providerMessageId: cellToText(row[6]),
        error: cellToText(row[7]),
        isTest: cellToBool(row[8]),
      });
    }

    return entries;
  }

  async appendEntry(entry: MessageLogEntry): Promise<void> {
    await this.ensureSheet();
    await sheetsValuesAppend(APPEND_RANGE, [
      entry.dutyDate,
      entry.person,
      entry.phone,
      entry.reminderType,
      entry.status,
      entry.sentAt,
      entry.providerMessageId,
      entry.error,
      entry.isTest,
    ]);
  }
}
