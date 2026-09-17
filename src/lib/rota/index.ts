import "server-only";
import { GoogleSheetsRotaProvider } from "./google-sheets-provider";
import type { RotaProvider } from "./types";

export type { RotaProvider, RotaEntry, TeamMember } from "./types";

let provider: RotaProvider | null = null;

export function getRotaProvider(): RotaProvider {
  if (!provider) provider = new GoogleSheetsRotaProvider();
  return provider;
}
