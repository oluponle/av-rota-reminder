import "server-only";
import { normalizeUkPhoneNumber } from "@/lib/phone";
import type { RotaEntry, RotaProvider, TeamMember } from "./types";

export interface ResolvedAssignment {
  dutyDate: string;
  personName: string | null;
  phoneRaw: string | null;
  phoneE164: string | null;
  /** Set when there's something an admin should look at (nobody scheduled,
   *  person missing from the Team sheet, or an unnormalisable number). */
  problem: string | null;
}

/** Pure matching logic, given already-fetched sheet data -- no I/O, so it's
 *  cheap to call once per date when resolving several upcoming Sundays. */
export function matchAssignment(
  rota: RotaEntry[],
  team: TeamMember[],
  dutyDate: string
): ResolvedAssignment {
  const entry = rota.find((r) => r.date === dutyDate);

  if (!entry) {
    return {
      dutyDate,
      personName: null,
      phoneRaw: null,
      phoneE164: null,
      problem: "No one is scheduled in the Rota sheet for this date.",
    };
  }

  const personName = entry.person.trim();
  const member = team.find(
    (t) => t.name.trim().toLowerCase() === personName.toLowerCase()
  );

  if (!member) {
    return {
      dutyDate,
      personName,
      phoneRaw: null,
      phoneE164: null,
      problem: `"${personName}" is on the Rota but was not found in the Team sheet.`,
    };
  }

  const normalized = normalizeUkPhoneNumber(member.phone);
  if (!normalized.ok) {
    return {
      dutyDate,
      personName,
      phoneRaw: member.phone,
      phoneE164: null,
      problem: `${personName}'s phone number is invalid: ${normalized.error}`,
    };
  }

  return {
    dutyDate,
    personName,
    phoneRaw: member.phone,
    phoneE164: normalized.e164,
    problem: null,
  };
}

export async function resolveRotaAssignment(
  provider: RotaProvider,
  dutyDate: string
): Promise<ResolvedAssignment> {
  const [rota, team] = await Promise.all([
    provider.getRota(),
    provider.getTeam(),
  ]);
  return matchAssignment(rota, team, dutyDate);
}

export async function resolveRotaAssignments(
  provider: RotaProvider,
  dutyDates: string[]
): Promise<ResolvedAssignment[]> {
  const [rota, team] = await Promise.all([
    provider.getRota(),
    provider.getTeam(),
  ]);
  return dutyDates.map((date) => matchAssignment(rota, team, date));
}
