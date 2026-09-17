# AV Rota Reminder

Sends automatic WhatsApp reminders to the church Streaming Team based on a
rota that lives entirely in Google Sheets.

**Architecture:**

- **Google Sheets** is the only data store -- three worksheets in one
  spreadsheet:
  - `Rota` and `Team` (source of truth for the rota and contact details --
    the app only ever reads these).
  - `MessageLog` (the app's own append-only reminder/message history --
    created automatically the first time it's needed, and the only sheet
    the app ever writes to).
- **Next.js on Vercel** is the application, reminder processor, and
  scheduled endpoint.
- **Twilio** sends the WhatsApp messages, behind a small `MessagingProvider`
  abstraction.

There is no database, no login, and no in-app editing of the rota or team --
edit the Google Sheet, the app just reads it.

Every person gets two messages per duty: a **Sunday advance notice** (sent
the Sunday before, ~19:00 Europe/London, for next Sunday) and a **Friday
reminder** (sent the Friday before, ~18:00 Europe/London, for the coming
Sunday). On the Sunday run, the admin also gets an **admin notification**
naming who's on duty next Sunday.

All three of these are sent as Twilio WhatsApp **Content templates**
(ContentSid + ContentVariables), not free-form messages -- Twilio requires
an approved template for business-initiated WhatsApp messages. See
"Twilio Content templates" below.

## 1. Run locally

```bash
npm install
cp .env.example .env.local   # fill in real values, see sections below
npm run dev
```

Open http://localhost:3000 -- you'll see the dashboard (next duty, upcoming
rota, recent messages, problems, and test controls). Nothing will work until
you've configured Google Sheets and Twilio below.

## 2. Google Sheets setup

### 2.1 Create the spreadsheet

One Google Sheet with two tabs to start, exactly named `Rota` and `Team`
(the app creates a third tab, `MessageLog`, automatically -- see below):

**Rota** (columns A:B, header row + data from row 2):

| Date (real date cell) | Person |
| --- | --- |
| 6 Sep 2026 | Ponle |
| 13 Sep 2026 | Daniel |

**Team** (columns A:B, header row + data from row 2):

| Name | Phone |
| --- | --- |
| Ponle | 7960357473 |
| Daniel | 07946017680 |

The `Date` column must be real Sheets date values (not text) -- type the
date normally and let Sheets format it. Phone numbers can be in any
reasonable UK format (with or without a leading 0, with or without +44) --
the app normalises them.

**Don't create a `MessageLog` tab yourself** -- the first time the app
needs it (a dashboard load, a test send, or a scheduled run) it checks
whether that worksheet exists and creates it, with this header row, if not:

`DutyDate | Person | Phone | ReminderType | Status | SentAt | ProviderMessageId | Error | IsTest`

- `ReminderType`: `SUNDAY_ADVANCE`, `FRIDAY_REMINDER`, `ADMIN` (the admin
  notification sent alongside a `SUNDAY_ADVANCE` run), or `TEST` (the
  standalone "send a test WhatsApp" control, not tied to a duty).
- `Status`: `SENT` or `FAILED`.
- `IsTest`: `TRUE` for anything triggered from the dashboard's test
  controls, `FALSE` for real scheduled sends. Test rows are logged for
  visibility but are never consulted when deciding whether a production
  reminder still needs to be sent.

### 2.2 Enable the Google Sheets API

1. Go to https://console.cloud.google.com and create (or select) a project.
2. APIs & Services -> Library -> search "Google Sheets API" -> Enable.

### 2.3 Create a service account

1. APIs & Services -> Credentials -> Create Credentials -> Service account.
2. Give it any name (e.g. `av-rota-reminder`). No project-level role is
   needed -- access is granted at the spreadsheet level (next step).
3. Open the new service account -> Keys -> Add key -> Create new key -> JSON.
   This downloads a JSON file to your computer.
4. From that JSON file you need two values for your `.env.local`:
   - `client_email` -> `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` -> `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (keep the
     `\n` sequences literally as they appear in the JSON string; wrap the
     whole value in quotes in `.env.local`)

Delete the downloaded JSON file once you've copied these values, or store it
somewhere safe outside the repo -- never commit it.

### 2.4 Share the sheet with the service account -- as an Editor

Open your Google Sheet -> Share -> paste the service account's email
(`client_email`, looks like `xxx@xxx.iam.gserviceaccount.com`) -> give it
**Editor** access.

This is more than the app strictly needs for `Rota`/`Team` (read-only would
suffice for those), but Google Sheets permissions are spreadsheet-wide, and
the app needs write access to create and append to `MessageLog`. The app
itself never writes to `Rota` or `Team` -- only to `MessageLog`.

### 2.5 Find the Spreadsheet ID

It's the long ID in the sheet's URL:

```
https://docs.google.com/spreadsheets/d/THIS_PART_IS_THE_ID/edit
```

Set that as `GOOGLE_SPREADSHEET_ID`.

## 3. Twilio setup

1. Create a Twilio account: https://www.twilio.com/try-twilio.
2. From the Console dashboard, copy your **Account SID** and **Auth Token**
   -> `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`.

### 3.1 WhatsApp Sandbox (for development/testing)

1. Console -> Messaging -> Try it out -> Send a WhatsApp message.
2. Follow the instructions to join the sandbox (send the given code to the
   given number from your own WhatsApp).
3. Set the sandbox number as `TWILIO_WHATSAPP_FROM_NUMBER` (E.164, e.g.
   `+14155238886`, no `whatsapp:` prefix -- the app adds that).
4. Anyone you want to send test messages to must also join the sandbox from
   their own phone first (Twilio sandboxes require opt-in).

For production, apply for WhatsApp access on a real Twilio number instead of
the sandbox (Twilio's WhatsApp Business onboarding) and use that number as
`TWILIO_WHATSAPP_FROM_NUMBER`.

### 3.2 Twilio Content templates

Twilio requires scheduled/business-initiated WhatsApp messages to use an
approved **Content template** (ContentSid + ContentVariables) rather than a
free-form `Body`. Create these three WhatsApp **Utility** templates in
Console -> Messaging -> Content Template Builder (or via the Content API),
get each one **approved** by WhatsApp, then copy each template's **Content
SID** (starts `HX...`) into `.env.local`:

| Template name | Body | Env var |
| --- | --- | --- |
| `sundayreminder` | `Hi {{1}}, just a heads-up that you're on the Streaming Team rota next Sunday, {{2}}.` | `TWILIO_SUNDAY_CONTENT_SID` |
| `fridayreminder` | `Hi {{1}}, just a reminder that you're on the Streaming Team rota this Sunday, {{2}}. See you Sunday!` | `TWILIO_FRIDAY_CONTENT_SID` |
| `adminnotification` | `Streaming Team rota: {{1}} is on duty next Sunday, {{2}}.` | `TWILIO_ADMIN_CONTENT_SID` |

`{{1}}` is always the person's first name and `{{2}}` the friendly duty date
(e.g. "Sunday 20 September"). Test sends prefix `{{1}}` with `[TEST] ` (the
only thing Twilio lets you vary) so a test message is still visibly marked
as a test in WhatsApp itself, on top of `IsTest = TRUE` in `MessageLog`.

Also set `ADMIN_WHATSAPP_NUMBER` -- your own number, to receive the
`adminnotification` message. It accepts the same UK formats as the Team
sheet (`07...`, `7...`, `44...`, `+44...`).

The free-form `sendWhatsApp`/`sendSMS` methods still exist in
`MessagingProvider` and are only used by the dashboard's standalone
"Send a test WhatsApp" connectivity check, which isn't a scheduled/template
message.

## 4. Required environment variables

See `.env.example` for the full list with placeholders. Summary:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_SPREADSHEET_ID` | The spreadsheet's ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Service account private key |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_WHATSAPP_FROM_NUMBER` | Twilio WhatsApp sender number |
| `TWILIO_SUNDAY_CONTENT_SID` | Content SID of the `sundayreminder` template |
| `TWILIO_FRIDAY_CONTENT_SID` | Content SID of the `fridayreminder` template |
| `TWILIO_ADMIN_CONTENT_SID` | Content SID of the `adminnotification` template |
| `ADMIN_WHATSAPP_NUMBER` | Your number, to receive the admin notification |
| `CRON_SECRET` | Shared secret that authorises `/api/reminders/run` |

That's the complete list -- there is no database to configure. Never commit
`.env.local`; `.env.example` contains placeholders only.

## 5. Testing the workflow (no need to wait for Sunday/Friday)

Everything below is available as a button on the dashboard, under **Test
controls**:

1. **Test Google Sheets connectivity** -- confirms the service account can
   read both worksheets and reports row counts.
2. **Preview Sunday advance notice** / **Preview Friday reminder** -- shows
   who would receive that reminder right now (computed from today's date),
   including any phone-number or sheet-matching problems, without sending
   anything.
3. **Send a test WhatsApp** -- type any UK number and send a fixed test
   message, to check Twilio/WhatsApp end-to-end independent of the rota.
4. **Trigger test Sunday advance** / **Trigger test Friday reminder** --
   sends a real WhatsApp template message (first name prefixed `[TEST]`) to
   whoever the rota currently resolves for that reminder. The Sunday one
   also sends a test `adminnotification` to `ADMIN_WHATSAPP_NUMBER`. These
   are logged with `IsTest = TRUE` and **never** block or duplicate the
   real scheduled send/notification.
5. **Run scheduled check now** -- runs the exact production logic
   (`runScheduledReminders`) immediately; it only actually sends if it's
   really Sunday 19:00 or Friday 18:00 Europe/London right now, so it's safe
   to click any time.

All of these append a row to `MessageLog`, so you can also just open the
spreadsheet to see the result.

You can also call the scheduled endpoint directly:

```bash
curl -X POST https://your-deployment.vercel.app/api/reminders/run \
  -H "Authorization: Bearer $CRON_SECRET"
```

Locally: `curl -X POST http://localhost:3000/api/reminders/run -H "Authorization: Bearer $CRON_SECRET"`.

## 6. Deploying to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket and import it in Vercel, or run
   `vercel` from the project root.
2. In Vercel Project Settings -> Environment Variables, add every variable
   from `.env.example` with real values (Production, and Preview if you
   want preview deployments to work too).
3. Deploy.

## 7. Configuring scheduled execution

`vercel.json` defines two crons, both on the **Hobby plan-compatible**
pattern of firing at most once a week each (Hobby caps cron frequency at
once/day, so anything more frequent -- like the hourly schedule this
project used to use -- gets silently reduced and can't be relied on):

```json
{
  "crons": [
    { "path": "/api/reminders/run", "schedule": "30 18 * * 0" },
    { "path": "/api/reminders/run", "schedule": "30 17 * * 5" }
  ]
}
```

Once `CRON_SECRET` is set as a project environment variable, Vercel
automatically sends `Authorization: Bearer $CRON_SECRET` when it calls this
path, which matches what the route checks.

**Why 18:30/17:30 UTC:** a cron schedule is fixed in UTC and can't shift for
British Summer Time, but the target times (Sunday 19:00, Friday 18:00) are
Europe/London. Each cron is set to the *midpoint* between what that London
time is in GMT vs BST, so the same schedule is at most ~30 minutes off in
either season:

| | Sunday target | Friday target |
| --- | --- | --- |
| GMT (winter) equivalent | 19:00 UTC | 18:00 UTC |
| BST (summer) equivalent | 18:00 UTC | 17:00 UTC |
| Cron (fixed, UTC) | 18:30 | 17:30 |
| → London time in GMT | 18:30 (30 min early) | 17:30 (30 min early) |
| → London time in BST | 19:30 (30 min late) | 18:30 (30 min late) |

The processor's own "is this due?" check (`runScheduledReminders` in
`src/lib/reminders/processor.ts`) accepts anything within 60 minutes of the
target hour (`isWithinMinutesOfHour` in `src/lib/london-time.ts`), rather
than requiring an exact hour match -- so that ~30 minute seasonal drift
(plus a safety margin) is comfortably absorbed and never causes a reminder
to be silently skipped. No manual changes are needed when the clocks
change.

This relies on Hobby supporting at least 2 cron job definitions; if your
plan's limits change, calling the same `POST /api/reminders/run` (with the
same `Authorization` header) from a free external scheduler (e.g.
https://cron-job.org or a scheduled GitHub Actions workflow) works
identically -- the endpoint is safe to call as often as you like, since
MessageLog's duplicate protection (not the schedule) is what prevents a
reminder from ever being sent twice.

## Architecture notes

- `src/lib/google-sheets/client.ts` -- low-level, read+write Google Sheets
  API access (values get/append/update, worksheet listing/creation), shared
  by both the rota reader and the message log.
- `src/lib/rota` -- `RotaProvider` interface + `GoogleSheetsRotaProvider`
  (reads `Rota`/`Team` only) + matching/normalisation logic
  (`resolveRotaAssignment(s)`).
- `src/lib/message-log` -- `MessageLogStore` interface +
  `GoogleSheetsMessageLog`, which creates the `MessageLog` worksheet on
  first use and is the only thing the app ever writes to Google Sheets.
- `src/lib/phone.ts` -- UK phone number normalisation to E.164.
- `src/lib/london-time.ts` -- Europe/London-aware date helpers (no
  hard-coded UTC offsets; DST handled via `Intl`).
- `src/lib/messaging` -- `MessagingProvider` interface + `TwilioMessagingProvider`.
  `sendWhatsAppTemplate` (ContentSid + ContentVariables) is what the
  reminder processor uses for all business-initiated sends; `sendWhatsApp`
  (free-form `Body`) and `sendSMS` remain for the standalone test-send
  control. Swapping providers means changing `src/lib/messaging/index.ts`
  only.
- `src/lib/reminders/processor.ts` -- resolves the recipient, checks
  `MessageLog` for an existing successful send, sends via the appropriate
  Content template, and appends the outcome. `processSundayAdvance` composes
  the person's `sundayreminder` send with the separate `adminnotification`
  send (its own MessageLog-keyed duplicate protection, independent of
  whether the person's own reminder succeeded). Shared by the scheduled
  endpoint and the dashboard's test-trigger buttons.
- `src/lib/actions/admin.ts` -- server actions backing the dashboard's test
  controls.

Errors are caught at each boundary (Sheets access, sheet/person matching,
phone normalisation, Twilio send) so one bad rota row or an unreachable
sheet surfaces as a "Problem" on the dashboard rather than crashing the app
or blocking everyone else's reminder.

**On concurrency:** Google Sheets has no transactions, so there's a small,
unavoidable check-then-send race if two invocations run at the exact same
moment (e.g. the scheduled cron firing while someone also clicks a test
button). Given this is a twice-a-week, single-church rota, that risk is
accepted rather than solved by introducing a database purely for locking --
the check is kept immediately before the send to keep the window as small
as practical.
