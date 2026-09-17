import "server-only";
import { sheetsValuesGet } from "@/lib/google-sheets/client";
import { cellToDateString, cellToText } from "@/lib/google-sheets/cells";
import type { RotaEntry, RotaProvider, TeamMember } from "./types";

export class GoogleSheetsRotaProvider implements RotaProvider {
  async getRota(): Promise<RotaEntry[]> {
    const rows = await sheetsValuesGet("Rota!A2:B");
    const entries: RotaEntry[] = [];

    for (const row of rows) {
      const date = cellToDateString(row[0]);
      const person = cellToText(row[1]);
      // Skip blank trailing rows rather than letting one bad row break the
      // whole read.
      if (!date || !person) continue;
      entries.push({ date, person });
    }

    return entries;
  }

  async getTeam(): Promise<TeamMember[]> {
    const rows = await sheetsValuesGet("Team!A2:B");
    const members: TeamMember[] = [];

    for (const row of rows) {
      const name = cellToText(row[0]);
      const phone = cellToText(row[1]);
      if (!name) continue;
      members.push({ name, phone });
    }

    return members;
  }
}
