import { getRotaProvider } from "@/lib/rota";
import { resolveRotaAssignments, type ResolvedAssignment } from "@/lib/rota/assignment";
import { getMessageLogStore } from "@/lib/message-log";
import type { MessageLogEntry, ReminderType } from "@/lib/message-log";
import {
  getLondonNow,
  nextSunday,
  addDaysToISODate,
  formatFriendlySundayDate,
} from "@/lib/london-time";
import { AdminActionCard } from "@/components/admin-action-card";
import {
  testSheetsConnectivity,
  previewReminder,
  sendTestSms,
  triggerTestSundayAdvance,
  triggerTestFridayReminder,
  runScheduledCheckNow,
} from "@/lib/actions/admin";

export const dynamic = "force-dynamic";

const UPCOMING_COUNT = 5;

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  pending: "bg-slate-100 text-slate-500",
};

function statusFor(
  productionEntries: MessageLogEntry[],
  type: ReminderType,
  dutyDate: string,
  personName: string | null
): "sent" | "failed" | "pending" {
  if (!personName) return "pending";
  const entry = productionEntries.find(
    (e) =>
      e.reminderType === type && e.dutyDate === dutyDate && e.person === personName
  );
  if (!entry) return "pending";
  return entry.status === "SENT" ? "sent" : "failed";
}

interface RecentMessage {
  key: string;
  when: string;
  person: string | null;
  dutyDate: string | null;
  type: string;
  status: "sent" | "failed";
  isTest: boolean;
  errorMessage: string | null;
}

export default async function DashboardPage() {
  const london = getLondonNow();
  const firstUpcomingSunday = nextSunday(london.date, { strictlyAfter: false });
  const upcomingDates = Array.from({ length: UPCOMING_COUNT }, (_, i) =>
    addDaysToISODate(firstUpcomingSunday, i * 7)
  );

  let assignments: ResolvedAssignment[] = upcomingDates.map((date) => ({
    dutyDate: date,
    personName: null,
    phoneRaw: null,
    phoneE164: null,
    problem: null,
  }));
  let logEntries: MessageLogEntry[] = [];
  let sheetsError: string | null = null;

  try {
    const rotaProvider = getRotaProvider();
    const messageLog = getMessageLogStore();
    const [resolvedAssignments, entries] = await Promise.all([
      resolveRotaAssignments(rotaProvider, upcomingDates),
      messageLog.getEntries(),
    ]);
    assignments = resolvedAssignments;
    logEntries = entries;
  } catch (error) {
    sheetsError = error instanceof Error ? error.message : String(error);
  }

  const productionUpcomingEntries = logEntries.filter(
    (e) => !e.isTest && upcomingDates.includes(e.dutyDate)
  );

  const recent: RecentMessage[] = logEntries
    .slice(-10)
    .reverse()
    .map((e, i) => ({
      key: `${e.dutyDate}-${e.person}-${e.reminderType}-${e.sentAt}-${i}`,
      when: e.sentAt,
      person: e.person || null,
      dutyDate: e.dutyDate || null,
      type: e.reminderType,
      status: e.status === "SENT" ? "sent" : "failed",
      isTest: e.isTest,
      errorMessage: e.error || null,
    }));

  const problems: string[] = [];
  if (sheetsError) {
    problems.push(`Google Sheets access problem: ${sheetsError}`);
  }
  for (const a of assignments) {
    if (a.problem) {
      problems.push(`${formatFriendlySundayDate(a.dutyDate)}: ${a.problem}`);
    }
  }
  for (const entry of productionUpcomingEntries) {
    if (entry.status === "FAILED") {
      problems.push(
        `Failed to send ${entry.reminderType} to ${entry.person} for ${formatFriendlySundayDate(entry.dutyDate)}: ${entry.error || "unknown error"}`
      );
    }
  }

  const nextDuty = assignments[0];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Dashboard</h2>
        <p className="mt-1 text-sm text-slate-600">
          Sunday advance notices send at 19:00 and Friday reminders at 18:00,
          both Europe/London time.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Next duty
        </h3>
        <p className="mt-2 text-base font-semibold text-slate-900">
          {formatFriendlySundayDate(nextDuty.dutyDate)}
        </p>
        <p className="text-sm text-slate-600">
          {nextDuty.personName ?? "Nobody scheduled"}
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-lg font-medium text-slate-900">Upcoming rota</h3>
        </div>
        <ul className="divide-y divide-slate-200">
          {assignments.map((a) => {
            const sundayStatus = statusFor(
              productionUpcomingEntries,
              "SUNDAY_ADVANCE",
              a.dutyDate,
              a.personName
            );
            const fridayStatus = statusFor(
              productionUpcomingEntries,
              "FRIDAY_REMINDER",
              a.dutyDate,
              a.personName
            );
            const adminStatus = statusFor(
              productionUpcomingEntries,
              "ADMIN",
              a.dutyDate,
              a.personName
            );
            return (
              <li
                key={a.dutyDate}
                className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {formatFriendlySundayDate(a.dutyDate)}
                  </p>
                  <p className="text-sm text-slate-600">
                    {a.personName ?? "Nobody scheduled"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <span
                    title="Sunday advance notice"
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[sundayStatus]}`}
                  >
                    Sun: {sundayStatus}
                  </span>
                  <span
                    title="Friday reminder"
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[fridayStatus]}`}
                  >
                    Fri: {fridayStatus}
                  </span>
                  <span
                    title="Admin notification"
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[adminStatus]}`}
                  >
                    Admin: {adminStatus}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-lg font-medium text-slate-900">
            Recent messages
          </h3>
        </div>
        {recent.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">
            No messages have been sent yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {recent.map((m) => (
              <li
                key={m.key}
                className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {m.person || "(ad-hoc test)"} · {m.type}
                    {m.isTest && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                        TEST
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {m.dutyDate ? formatFriendlySundayDate(m.dutyDate) : ""}
                    {m.errorMessage ? ` · ${m.errorMessage}` : ""}
                  </p>
                </div>
                <span
                  className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[m.status]}`}
                >
                  {m.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-lg font-medium text-slate-900">Problems</h3>
        {problems.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No problems detected.</p>
        ) : (
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-red-700">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-medium text-slate-900">Test controls</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AdminActionCard
            title="Test Google Sheets connectivity"
            description="Confirms the service account can read the Rota and Team sheets."
            buttonLabel="Test connectivity"
            action={testSheetsConnectivity}
          />
          <AdminActionCard
            title="Preview Sunday advance notice"
            description="Shows who would receive next Sunday's advance notice, without sending."
            buttonLabel="Preview"
            action={previewReminder.bind(null, "SUNDAY_ADVANCE")}
          />
          <AdminActionCard
            title="Preview Friday reminder"
            description="Shows who would receive this Sunday's Friday reminder, without sending."
            buttonLabel="Preview"
            action={previewReminder.bind(null, "FRIDAY_REMINDER")}
          />
          <AdminActionCard
            title="Trigger test Sunday advance"
            description="Sends a real SMS (person + admin notification) marked [TEST]. Does not block real reminders."
            buttonLabel="Send test"
            action={triggerTestSundayAdvance}
          />
          <AdminActionCard
            title="Trigger test Friday reminder"
            description="Sends a real SMS marked [TEST]. Does not block the real reminder."
            buttonLabel="Send test"
            action={triggerTestFridayReminder}
          />
          <AdminActionCard
            title="Run scheduled check now"
            description="Runs the exact production check (only sends if it's actually Sun 19:00 or Fri 18:00 London time)."
            buttonLabel="Run check"
            action={runScheduledCheckNow}
          />
          <AdminActionCard
            title="Send a test SMS"
            description="Sends a fixed test SMS to the configured admin phone number, to verify Twilio SMS end-to-end."
            buttonLabel="Send test"
            action={sendTestSms}
          />
        </div>
      </section>
    </div>
  );
}
