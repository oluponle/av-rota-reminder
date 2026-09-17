import "server-only";
import { GoogleSheetsMessageLog } from "./google-sheets-message-log";
import type { MessageLogStore } from "./types";

export type {
  MessageLogStore,
  MessageLogEntry,
  ReminderType,
  MessageStatus,
} from "./types";

let store: MessageLogStore | null = null;

export function getMessageLogStore(): MessageLogStore {
  if (!store) store = new GoogleSheetsMessageLog();
  return store;
}
