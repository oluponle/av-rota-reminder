import { NextResponse } from "next/server";
import { runScheduledReminders } from "@/lib/reminders/processor";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/**
 * Checks whether a reminder is due right now (Europe/London time) and sends
 * it if so; otherwise it's a no-op. Safe to call as often as you like --
 * see runScheduledReminders for why.
 *
 * GET: what Vercel Cron calls (see vercel.json). Vercel automatically sends
 * `Authorization: Bearer $CRON_SECRET` when that env var is set on the
 * project, matching the check below.
 * POST: the same thing, for manual testing with curl (see README).
 */
async function handle() {
  try {
    const result = await runScheduledReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Reminder processor failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handle();
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handle();
}
