export interface RotaEntry {
  /** YYYY-MM-DD, the Sunday duty date. */
  date: string;
  /** Person's name exactly as trimmed from the sheet. */
  person: string;
}

export interface TeamMember {
  /** Name exactly as trimmed from the sheet. */
  name: string;
  /** Phone number exactly as it appears in the sheet, un-normalised. */
  phone: string;
}

/**
 * Abstraction over the read-only rota/team data source. Google Sheets is
 * the source of truth for the MVP, but business logic (matching,
 * normalisation, reminder sending) depends only on this interface.
 */
export interface RotaProvider {
  getRota(): Promise<RotaEntry[]>;
  getTeam(): Promise<TeamMember[]>;
}
