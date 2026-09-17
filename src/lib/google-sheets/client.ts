import "server-only";
import { JWT } from "google-auth-library";

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

// Read+write: Rota/Team are only ever read, but MessageLog needs to be
// created and appended to, and it's the same service account/spreadsheet
// for all three, so one scope covers everything.
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

let jwt: JWT | null = null;

function getClient(): { auth: JWT; spreadsheetId: string } {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawPrivateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!spreadsheetId || !clientEmail || !rawPrivateKey) {
    throw new Error(
      "Missing GOOGLE_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY environment variables."
    );
  }

  if (!jwt) {
    // .env files can't hold real newlines in a single-line value, so the
    // key is stored with literal "\n" sequences and unescaped here.
    const privateKey = rawPrivateKey.replace(/\\n/g, "\n");
    jwt = new JWT({ email: clientEmail, key: privateKey, scopes: SCOPES });
  }

  return { auth: jwt, spreadsheetId };
}

function describeError(action: string, error: unknown): string {
  return `${action}: ${error instanceof Error ? error.message : String(error)}`;
}

export async function sheetsValuesGet(range: string): Promise<unknown[][]> {
  const { auth, spreadsheetId } = getClient();
  const url =
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}` +
    `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;

  try {
    const response = await auth.request<{ values?: unknown[][] }>({ url });
    return response.data.values ?? [];
  } catch (error) {
    throw new Error(
      describeError(`Could not read Google Sheet range "${range}"`, error)
    );
  }
}

export async function sheetsValuesAppend(
  range: string,
  row: unknown[]
): Promise<void> {
  const { auth, spreadsheetId } = getClient();
  const url =
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append` +
    `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

  try {
    await auth.request({ url, method: "POST", data: { values: [row] } });
  } catch (error) {
    throw new Error(
      describeError(`Could not append to Google Sheet range "${range}"`, error)
    );
  }
}

export async function sheetsValuesUpdate(
  range: string,
  row: unknown[]
): Promise<void> {
  const { auth, spreadsheetId } = getClient();
  const url =
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}` +
    `?valueInputOption=RAW`;

  try {
    await auth.request({ url, method: "PUT", data: { values: [row] } });
  } catch (error) {
    throw new Error(
      describeError(`Could not write Google Sheet range "${range}"`, error)
    );
  }
}

export async function sheetsGetSheetTitles(): Promise<string[]> {
  const { auth, spreadsheetId } = getClient();
  const url = `${SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties.title`;

  try {
    const response = await auth.request<{
      sheets?: { properties?: { title?: string } }[];
    }>({ url });
    return (response.data.sheets ?? [])
      .map((s) => s.properties?.title ?? "")
      .filter(Boolean);
  } catch (error) {
    throw new Error(
      describeError("Could not read the spreadsheet's worksheet list", error)
    );
  }
}

export async function sheetsAddSheet(title: string): Promise<void> {
  const { auth, spreadsheetId } = getClient();
  const url = `${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`;

  try {
    await auth.request({
      url,
      method: "POST",
      data: { requests: [{ addSheet: { properties: { title } } }] },
    });
  } catch (error) {
    throw new Error(
      describeError(`Could not create the "${title}" worksheet`, error)
    );
  }
}
