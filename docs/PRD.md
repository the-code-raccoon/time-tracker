# Time Tracker — Product Requirements Document

> **Living document.** Update it as decisions are made. Each change gets a line in the [Changelog](#changelog).

|                  |            |
| ---------------- | ---------- |
| **Owner**        | F.H        |
| **Status**       | Draft      |
| **Last updated** | 2026-10-05 |

---

## 1. Summary

A personal, password-protected web app for tracking time. It replaces the current manual process of logging time blocks in a Google Calendar named **"Schedule"**. The app syncs with that calendar in both directions when asked, so either one can be the place where time is entered. When the two disagree, the app shows the differences and lets the user reconcile them.

## 2. Background & current workflow

Time is currently tracked by hand as events in the "schedule" Google Calendar:

- Calendar ID: `ac0b86d4a2fc23d3508ea0b7b661d1e6453b82ee2570b304a1be204d16b48609@group.calendar.google.com`
- Timezone: `America/Toronto`

### 2.1 Observed conventions

These come from reviewing about 1,230 events sampled across the calendar's history: 13–30 Apr, 1–19 Jun, 1–19 Aug and 7 Sep–5 Oct 2026. The first event is on **2026-04-13**. The full history is estimated at about 3,000 events.

**Colour is the category.** Titles are free text. The colour (Google `colorId`) is what groups events:

| `colorId` | GCal name        | Category (inferred)              | Example titles                                               |
| --------- | ---------------- | -------------------------------- | ------------------------------------------------------------ |
| 4         | Flamingo         | Wake up                          | `wake up`                                                    |
| 10        | Basil            | Food                             | `make + eat breakfast`, `eat snack`, `eat dinner`            |
| 6         | Tangerine        | Japanese study                   | `jp - srs`, `jp - new vocab`, `jp - listening`, `jp - tutor` |
| 3         | Grape            | Content / creative               | `stream`, `storyboard`, `livestream thumbnail`, `make bgs`   |
| 7         | Peacock          | Leisure                          | `chill`, `pjsk`, `read manga`, `journal`, `doomscroll`       |
| 8         | Graphite         | Work                             | `work`                                                       |
| 11        | Tomato           | Errands / outings                | `grocery shopping - metro`, `doctor`, `flea market`          |
| 9         | Blueberry        | Health appointments              | `food psychotherapy`                                         |
| 5 | Banana | Exercise | `cardio`, `gym`, `gym + cardio` (all aliases of **exercise**) |
| 1 | Lavender | Leisure _(legacy colour)_ | `tiering` |
| 2         | Sage             | _(one-off)_                      | `shower`                                                     |
| _(none)_ | Calendar default | Self-care / logistics | `shower`, `put in contacts`, `unpack` |

**Other patterns:**

- **Colour meanings change over time.** For example, `shower` was Peacock in spring and has no colour now, and exercise used to be Banana. So an event's category comes from its own colour at import time, and the app lets you recategorise in bulk afterwards (CAT-5).
- **Common activities** (all sampled months, after normalisation): `work` (298 h), `stream`, `gym`, `cardio`, `pjsk`, `chilling`/`chill`, `wanikani + kaniwani + marumori srs`, `read pjsk event stories`, `summarize pjsk event stories`, `wake up`, `shower`, `eat snack`, `make + eat breakfast/lunch/dinner`, `journal`. There were 351 distinct raw titles; basic text normalisation brings that to 321, and the alias merging in §5.4 should reduce it much further.

- **Titles** are short and lowercase-ish but not consistent (`eat snack` vs `Eat snack`, `chill` vs `chilling`). Some use a `topic - detail` form (`jp - srs`). The same titles come up again and again, so autocomplete from past titles will save the most time.
- **Granularity is 5 minutes.** Start times fall on any 5-minute mark. Durations run from 5 minutes to about 9 hours; most are 5–30 minutes.
- **Overlaps are normal** (about 10% of events), e.g. `make + eat breakfast` during `work`. The app must allow and display overlapping entries.
- **Events can cross midnight**, e.g. 17:50 → 02:30.
- **No descriptions, locations, attendees or all-day events.** Only title, start, end and colour carry data.
- Recurring events are essentially unused (1 instance).
- Logged hours cover about 16–20 h/day on tracked days, with some days missing or sparse.

## 3. Goals & non-goals

### Goals

1. Make logging time faster than entering it in Google Calendar by hand.
2. Keep Google Calendar as an equal source of truth: entries can be made in either place.
3. Show summaries of where time goes (by day, week or category).
4. Work well on phone, tablet and desktop.

### Non-goals

- More than one user, teams, or sharing
- Billing or invoicing
- Automatic background sync (sync is **manual only**)
- Native mobile apps (a PWA install is a possible extra)

## 4. Users

There is one user, the owner, who uses the app from:

- **Desktop** (primary for review and editing; keyboard-heavy)
- **Phone** (quick entry on the go)
- **Tablet** (occasional)

## 5. Functional requirements

### 5.1 Authentication

| ID     | Requirement                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-1 | The whole app is behind a single password. There are no user accounts.                                                                             |
| AUTH-2 | The password is stored as a hash in an environment variable, never in the repo.                                                                    |
| AUTH-3 | Logging in sets an HttpOnly, Secure, SameSite=Strict session cookie that lasts about 30 days, so the user can stay logged in on their own devices. |
| AUTH-4 | Every API route checks the session. Unauthenticated requests get a 401.                                                                            |
| AUTH-5 | Failed logins are rate-limited (basic brute-force protection).                                                                                     |
| AUTH-6 | Google OAuth is a separate, one-time connection. The refresh token is stored server-side, encrypted, and never sent to the browser.                |

### 5.2 Time entries

| ID    | Requirement                                                                                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TE-1  | Create, edit and delete time entries: title, start, end, category (= GCal colour), and optional notes.                                                                                                |
| TE-1a | Title field autocompletes from past titles (case-insensitive), and a picked suggestion also fills in that title's usual category.                                                                     |
| TE-1b | Times can be set to any 5-minute increment. Date and time entry follows §5.2b. |
| TE-1c | Overlapping entries are allowed and shown side by side, like Google Calendar. Entries may cross midnight.                                                                                             |
| TE-2  | Views: **Day**, **Week**, **Month** and **Schedule/Agenda**, laid out like Google Calendar.                                                                                                           |
| TE-3  | Create an entry by dragging across empty grid space (see §5.2d). Clicking an empty slot still creates a 30-minute entry there. |
| TE-4  | Move or resize an entry by dragging (see §5.2d). |
| TE-5  | A start/stop timer for the activity happening now; stopping it creates an entry. The running timer is **stored server-side**, so a timer started on the phone can be seen and stopped on the desktop. |
| TE-6  | Quick-add from a text input (e.g. `9-10:30 Deep work`). _(Nice to have)_                                                                                                                              |
| TE-7  | All times are shown in `America/Toronto`, or the device timezone if that can be configured.                                                                                                           |

### 5.2a Categories

| ID    | Requirement                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CAT-1 | Each category has a **name**, an **app colour** (any colour, chosen freely) and a **GCal colour** (one of Google's 11 `colorId`s, or the calendar default).               |
| CAT-2 | The app colour and the GCal colour are independent. For example, Leisure can be Peacock in Google Calendar but any colour you like in the app.                            |
| CAT-3 | Changing a category's app colour applies **retroactively** to all of its entries straight away, because entries point to the category rather than storing a colour.       |
| CAT-4 | Changing a category's GCal colour marks all of its linked entries for update. They are recoloured in Google Calendar on the next sync, with a backup taken first (BAK-1). |
| CAT-5 | Categories can be created, renamed and merged. Entries can be moved between categories in bulk (e.g. "all `shower` entries → Self-care").                                 |
| CAT-6 | Seeded from the table in §2.1.                                                                                                                                            |
| CAT-7 | A **Categories** page (Settings → Categories, also opened with `s`) lists every category with its app colour, name, GCal colour, number of entries and total hours. |
| CAT-8 | On that page you can create a category, rename it, and reorder categories by dragging. The order is used in pickers and reports. |
| CAT-9 | **App colour** is picked from a palette (Google's 11 colours plus extra shades) or a custom hex value, with a live preview. The change applies retroactively (CAT-3). |
| CAT-10 | **GCal colour** is picked from Google's 11 named colours (Tomato, Flamingo, Tangerine, Banana, Sage, Basil, Peacock, Blueberry, Lavender, Grape, Graphite) or "Calendar default". Before saving, a warning says how many events will be recoloured in Google Calendar on the next sync (CAT-4). |
| CAT-11 | **Delete** a category: you choose where its entries go (another category, or none). **Merge** a category into another moves all of its entries. Both take a backup first (§5.5). |
| CAT-12 | **Move by title:** pick a title or activity (e.g. `shower`) and move all of its entries to a category in one step (CAT-5). |
| CAT-13 | When a category is given a GCal colour (on create or change), uncategorised imported entries with that colour join it. Their events already have that colour, so nothing is pushed for them. |

### 5.2b Entry editor: date & time (same as Google Calendar)

The date and time controls in the entry editor copy Google Calendar's:

`[Oct 5, 2026] [9:30am] to [5:10pm] [Oct 5, 2026]  (GMT-04:00) Eastern Time - Toronto`

| ID | Requirement |
|---|---|
| DT-1 | **Layout:** start date, start time, "to", end time, end date, then the time zone shown read-only. Each control is a compact filled field like Google Calendar's. On phones the row wraps, with start and end on separate lines. |
| DT-2 | **Date picker:** clicking a date opens a popover month calendar. It has a month/year header with ‹ › arrows, weeks starting on Sunday, days from the next and previous months shown dimmed, and the selected day as a filled circle. **Today is marked** with a ring in the accent colour and bold text; if today is also the selected day, the ring is drawn just outside the filled circle. The text is selected on focus so you can type over it. |
| DT-3 | **Typed dates:** dates can be typed and are parsed on Enter or blur, then shown as `Oct 5, 2026`. Accepted forms include `oct 5`, `Oct 5`, `october 5`, `5 oct`, `10/5`, `oct 5 2027` and `10/5/2027`. **A missing year means the current year.** Input that can't be parsed goes back to the previous value. |
| DT-4 | **Time picker:** clicking a time opens a list in 15-minute steps. In the end-time list each option also shows the resulting duration, e.g. `10:00am (30 mins)`, like Google Calendar. Times can also be typed, and any 5-minute value is accepted. They are shown as `9:30am`. |
| DT-5 | **Typed times:** accepted forms include `9:30`, `930`, `9`, `9:30p`, `9:30 pm`, `9.30pm` and `21:30`. |
| DT-6 | **am/pm inference** for a 12-hour time typed without am/pm (Google Calendar's behaviour). **Start time:** the first matching time at or after the current time of day. At 3:00pm, `9:30` → `9:30pm` and `4` → `4pm`; if both the am and the pm time have already passed today (at 11pm, `9:30`), pm is used. **End time:** the first matching time at or after the *start time* when the end is on the same day as the start (start 9:30am, `10` → `10am`); on a later day it is am. Times from 13:00 to 23:59, and times written with a leading zero (`0:30`, `09:30`), are taken as 24-hour times. |
| DT-7 | **End before start:** if the end date/time is earlier than the start, the end time and end date fields turn **red**, like Google Calendar (second screenshot), and Save is disabled until it's fixed. Nothing is auto-corrected. |
| DT-8 | **Duration control:** a duration field (e.g. `30 min`, `1 h 30 min`) with quick presets (5, 10, 15, 30, 45 min, 1 h, 1 h 30 min, 2 h) that also accepts typing (`90`, `1:30`, `1h30`, `1.5h`). Setting it sets **end = start + duration**. Changing the end updates the duration shown. |
| DT-9 | **Moving the start keeps the duration:** changing the start date or time moves the end by the same amount. Example: 9:30am–10:00am, change the start to 9:40am → 9:40am–10:10am. If the times are currently invalid (DT-7), the last valid duration is used. |
| DT-10 | Changing the end date or time never moves the start. |

### 5.2c Entry context menu

| ID | Requirement |
|---|---|
| CTX-1 | **Right-clicking** an entry in any view (Day, Week, Month, Schedule) opens a custom menu at the pointer instead of the browser's. On touch screens, **long-press** opens the same menu. It can also be opened from the keyboard with the context-menu key or Shift+F10 on the focused entry. |
| CTX-2 | **Change category:** a row of colour circles, one per category, like Google Calendar's colour picker. Hovering shows the category name and the current one has a check mark. Clicking a circle applies the change immediately, without opening the editor. |
| CTX-3 | **Delete entry:** deletes immediately and shows a "Entry deleted · Undo" snackbar. |
| CTX-4 | **Duplicate entry:** creates a copy with the same title, category, notes and times, then opens it in the editor so it can be moved. The copy isn't saved until you click Save, like Google Calendar. |
| CTX-5 | The menu closes on Escape, on a click outside, or after an action. It stays inside the viewport near screen edges. |

### 5.2d Drag and drop in the calendar (same as Google Calendar)

Applies to the Day and Week time grids. The Schedule list has no dragging.

| ID | Requirement |
|---|---|
| DRAG-1 | **Move:** dragging an entry moves it in **15-minute steps from its own time**, keeping its duration: 9:40 → 9:55 → 10:10, so the 5-minute precision of existing entries is kept (it does not snap to the quarter-hour grid). While dragging, a preview block shows the new position with its time range (e.g. `9:55 – 10:25am`), and the original is dimmed. Resizing (DRAG-3) likewise moves the end in 15-minute steps from its current time. |
| DRAG-2 | **Move across days:** in Week view, dragging sideways moves the entry to another day, keeping its time of day. |
| DRAG-3 | **Resize:** dragging an entry's bottom edge changes its end in 15-minute steps (the cursor changes to a resize cursor over the edge). The end can't go earlier than 5 minutes after the start, so 5-minute entries can still be resized. |
| DRAG-4 | **Create:** dragging down across empty grid space selects a range in 15-minute steps, then opens the editor with that start and end. |
| DRAG-5 | **Saving:** dropping saves straight away (no editor) and shows an "Entry moved" / "Entry resized" snackbar with **Undo**. If the save fails, the entry goes back and the error is shown. |
| DRAG-6 | **Click vs. drag:** a press that moves less than 4 px is a click, so it opens the editor as now. **Escape** while dragging cancels and puts the entry back. |
| DRAG-7 | **Auto-scroll:** dragging near the top or bottom of the grid scrolls it, so an entry can be moved to a time that's off-screen. |
| DRAG-8 | **Touch:** long-press, then drag without lifting, to move or resize. Long-press and lift without moving opens the context menu (CTX-1). A normal swipe scrolls the grid. |
| DRAG-9 | Entries that cross midnight move as one block: moving 11pm–1am down 30 minutes gives 11:30pm–1:30am, shown on both days. |

### 5.3 Google Calendar sync (manual, two-way)

| ID      | Requirement                                                                                                                                                                                                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SYNC-1  | A **Sync** button starts a two-way sync with the "schedule" calendar. Nothing syncs automatically.                                                                                                                                                                                                                |
| SYNC-2  | **Pull:** events created, changed or deleted in Google Calendar since the last sync are brought into the app.                                                                                                                                                                                                     |
| SYNC-3  | **Push:** entries created, changed or deleted in the app since the last sync are written to Google Calendar as normal events, the same as if they had been entered by hand.                                                                                                                                       |
| SYNC-4  | Each entry stores the Google event ID it is linked to, the event's `etag`/`updated` value, and a hash of its contents at the last sync.                                                                                                                                                                           |
| SYNC-5  | **Conflict detection:** a three-way comparison of _last synced_ vs. _app now_ vs. _calendar now_. A conflict happens when both sides changed the same entry.                                                                                                                                                      |
| SYNC-6  | Changes that don't conflict are applied automatically. Conflicts go to the **Reconcile** screen and are not applied.                                                                                                                                                                                              |
| SYNC-7  | **Reconcile screen:** shows each conflict side by side (app vs. calendar), with field-level differences highlighted. The choices are _Keep app_, _Keep calendar_, _Edit and merge_, or for a delete-vs-edit conflict, _Delete_ or _Restore_. There are also bulk actions: _Keep all app_ and _Keep all calendar_. |
| SYNC-8  | A sync summary appears afterwards: N pulled, N pushed, N conflicts.                                                                                                                                                                                                                                               |
| SYNC-9  | Uses Google's incremental `syncToken` so only changes are fetched. Falls back to a full resync if the token is invalidated (410).                                                                                                                                                                                 |
| SYNC-10 | First sync imports **the full history** of the calendar, starting from the earliest event (2026-04-13).                                                                                                                                                                                                           |
| SYNC-11 | Recurring events in the calendar are expanded into separate entries (`singleEvents=true`). _(To confirm once real data has been reviewed.)_                                                                                                                                                                       |
| SYNC-12 | Every event in the "Schedule" calendar is a time entry, including ones the app didn't create, and sync may edit or delete them. Backups (§5.5) make this safe.                                                                                                                                                    |

### 5.4 Title normalisation & activities

| ID     | Requirement                                                                                                                                                                                                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NORM-1 | Titles are normalised on import: lowercased, trimmed, repeated whitespace collapsed, and consistent spacing around `+`, `-` and `/` (`Make+eat lunch` → `make + eat lunch`).                                                                                                       |
| NORM-2 | Normalised titles map to a canonical **activity** through an editable alias table, e.g. `chill` / `chilling` → `chill`; `eat` / `eating` → `eat`; `make + eat preworkout` / `make + eat pre workout` → `make + eat pre-workout`; `gym + cardio` / `cardio + gym` → `gym + cardio`. |
| NORM-3 | A first-pass alias table is generated from the full import by grouping near-duplicates (same words in a different order, plurals, `-ing` forms, missing spaces). It is shown for review before it is applied.                                                                      |
| NORM-4 | The original title is always kept (`rawTitle`) so the normalisation can be undone.                                                                                                                                                                                                 |
| NORM-5 | Reports, search and autocomplete use the canonical activity.                                                                                                                                                                                                                       |
| NORM-6 | Canonical titles are **never written back** to existing Google Calendar events: normalisation happens only in the app. Entries *created in the app* are pushed with their canonical title. |
| NORM-7 | `gym`, `cardio`, `exercise`, `gym + cardio` and `cardio + gym` are aliases of the activity **exercise** (category Exercise, GCal Banana). |
| NORM-8 | When one activity appears with several colours over time, its category comes from the colour of its **most recent** entry (e.g. `shower` → Self-care, `tiering` → Leisure). Older events keep their colour in Google Calendar; only the app recategorises them. |

### 5.5 Backups

| ID    | Requirement                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BAK-1 | Before any sync writes to Google Calendar, the app saves a snapshot of every event it is about to change or delete (full event JSON) and of the matching app entries.                                         |
| BAK-2 | A full snapshot of the calendar (all events) and of the app database is also taken **once a day**, the first time the app is used that day (there are no paid cron jobs).                                     |
| BAK-3 | Backups are kept for **30 days**, then deleted automatically.                                                                                                                                                 |
| BAK-4 | A **Backups** screen lists snapshots (time, trigger, number of events). It can show what a snapshot contains and restore it, either all of it or selected events, to the app, to Google Calendar, or to both. |
| BAK-5 | Backups are stored in Postgres (JSONB).                                                                                                                                                                       |

### 5.6 Reporting

| ID    | Requirement                                                            |
| ----- | ---------------------------------------------------------------------- |
| REP-1 | Total time per category for a chosen range (day, week, month, custom). |
| REP-2 | A simple chart: a stacked bar of hours per day by category.            |
| REP-3 | CSV export. _(Nice to have)_                                           |

### 5.7 Keyboard shortcuts (same as Google Calendar)

These are desktop only. They are turned off while a text input has focus. Source: [Google Calendar keyboard shortcuts](https://support.google.com/calendar/answer/37034).

| Key                    | Action                              |
| ---------------------- | ----------------------------------- |
| `k` / `p`              | Previous date range                 |
| `j` / `n`              | Next date range                     |
| `t`                    | Go to today                         |
| `g`                    | Go to a date                        |
| `d` / `1`              | Day view                            |
| `w` / `2`              | Week view                           |
| `m` / `3`              | Month view                          |
| `x` / `4`              | Custom view _(optional)_            |
| `a` / `5`              | Schedule/Agenda view                |
| `c`                    | Create entry                        |
| `e`                    | Open details of the selected entry  |
| `Backspace` / `Delete` | Delete the selected entry           |
| `z`                    | Undo                                |
| `Ctrl/⌘ + s`           | Save (in the editor)                |
| `Esc`                  | Close the dialog or go back         |
| `/`                    | Search                              |
| `r`                    | Refresh (in this app: **run sync**) |
| `s`                    | Settings (opens the Categories page until there are more settings) |
| `?`                    | Show the shortcut help dialog       |

## 6. Data model (draft)

```ts
type TimeEntry = {
  id: string; // app UUID
  title: string; // canonical / normalised title
  rawTitle?: string; // exactly as it was in GCal on import
  activityId?: string;
  start: string; // ISO 8601 with offset
  end: string;
  categoryId?: string;
  notes?: string;
  // sync metadata
  gcalEventId?: string;
  gcalEtag?: string;
  lastSyncedHash?: string; // hash of {title,start,end,category,notes} at last sync
  deletedAt?: string; // soft delete so deletions can be pushed
  updatedAt: string;
};

// One category per GCal colorId ('1'–'11'), plus null for the calendar's default colour.
// Names can be edited in the app; colorId is what syncs.
type Category = {
  id: string;
  name: string;
  appColor: string; // any hex colour; changing it recolours all entries (CAT-3)
  gcalColorId: string | null; // '1'–'11' or null = calendar default
};

type Activity = { id: string; name: string; categoryId?: string }; // canonical activity
type ActivityAlias = { normalizedTitle: string; activityId: string };

// single row, server-side
type Timer = {
  activityId?: string;
  title: string;
  categoryId?: string;
  startedAt: string;
} | null;

type Backup = {
  id: string;
  createdAt: string; // deleted after 30 days
  trigger: "pre-sync" | "daily" | "manual";
  events: unknown[]; // GCal event JSON
  entries: TimeEntry[];
};

type SyncState = { syncToken?: string; lastSyncAt?: string };
```

### Implementation notes (M2)

- **Titles:** `title_aliases` maps a normalised title to its canonical title (NORM-2, NORM-7). It is applied on import and when saving in the app. `title_categories` fixes the category of some canonical titles regardless of colour (`exercise` → Exercise). This runs before the colour lookup and before NORM-8.
- **Colours:** an event's category comes from `categories.gcal_color_id`, plus `gcal_color_map` for legacy colours (Lavender → Leisure). An event with no colour gets the category whose GCal colour is "Calendar default".
- **Change detection:** `time_entries.app_hash` (a generated column) vs `last_synced_hash` shows a change made in the app; `gcal_remote_hash` shows a change made in Google. Changes on both sides go to `sync_conflicts` until the Reconcile screen (M3) resolves them.
- **Push:** creates, patches and deletes events using the last-seen etag (`If-Match`). If Google changed the event since the last pull, the entry becomes a conflict instead. An existing event gets a new title only if the title was changed in the app (NORM-6), and a new colour only if the category was changed in the app since the last sync, or CAT-4 forced it (`last_synced_category_id`). The push stops starting requests after about 40 s, and the rest go on the next sync. Google rate-limits bursts of writes (429, or 403 `rateLimitExceeded`), so the push runs 3 requests at a time and retries those responses with exponential backoff (honouring `Retry-After`).
- **Two-way sync** (`POST /api/sync`) pulls first, then pushes. The first import is pull-only, so it can be checked before anything is written back.
- **Reconcile:** *Keep app* records Google's version as seen, and the next push overwrites it (or recreates the event if Google deleted it). *Keep Google* applies Google's version. *Edit and merge* saves the edited entry, then keeps it.
- **Tokens:** the Google refresh and access tokens are AES-256-GCM encrypted (`TOKEN_ENCRYPTION_KEY`). The Calendar API is called with plain `fetch`, not the `googleapis` package, to keep functions small.

### Implementation notes (M4)

- **Timer (TE-5):** a single `timer` row (migration 0010). `GET/POST/PATCH/DELETE /api/timer` reads, starts, edits (title, category, start time) and discards it; `POST /api/timer/stop` deletes the row and inserts the entry in one statement, so stopping on two devices at once can't log it twice. Start and end are rounded to the nearest 5 minutes and the entry is at least 5 minutes long. A timer that ran over 24 hours is kept so it can be fixed or discarded. The app re-checks the timer when it comes back into view. Undoing a stop deletes the entry and restarts the timer from its original start.
- **Search (`/`):** `GET /api/entries?q=` matches titles and notes (newest first, 50 results). A query that is an alias also finds its canonical title (NORM-5). Picking a result opens it on its day.
- **Selected entry (`e`, Delete):** the entry block that has keyboard focus, which is also the last one clicked.
- **`z`** undoes the last action that offered Undo (delete, category change, move, resize, timer stop), even after its snackbar has gone.
- **Drag and drop:** a drop updates the cached entry straight away and saves in the background; a failed save puts it back. Touch drags block scrolling only once the long press has fired.
- **Month view:** each day lists as many entries as fit, then "N more", which opens the day's full list. An entry crossing midnight is listed on both days.
- **Phones:** the timer is a floating button above Create; Search, Settings and Sign out are in the toolbar's ⋮ menu.
- **Not done:** the optional custom view (`x` / `4`).

### Implementation notes (M5)

- **Reports (§5.6):** a Reports page (toolbar → chart icon, `/reports`) for a day, week, calendar month or custom range. `GET /api/reports?from&to&tz` returns minutes per category per local day of the device's time zone (so a day can be 23 or 25 hours), totals per category and the top 15 activities. Entries are cut at the range and at midnight. Overlapping entries each count in full, so a day can add up to more than 24 hours; the page says so.
- **Chart (REP-2):** stacked columns in the categories' app colours and order. Uncategorised time is hatched, because its grey is close to Graphite (Work). Hovering or focusing a day shows its breakdown, and a Table toggle shows the same numbers. The seeded colours (Google's palette) are hard to tell apart for colour-blind readers (e.g. Tangerine and Basil); the legend, tooltip and tables carry every value, and app colours can be changed under Settings → Categories.
- **CSV (REP-3):** `GET /api/reports?…&format=csv` downloads every entry overlapping the range (start, end, minutes, title, category, notes; local times). Cells starting with `=`, `+`, `-` or `@` are prefixed with `'` so spreadsheets don't run them.
- **Backups screen (BAK-4):** Settings → Backups lists snapshots; opening one shows each entry beside its Google event and marks which copy differs from now. Restore all or selected items:
  - *The app:* the entry goes back to the backup's app copy; the next sync sends it to Google.
  - *Google Calendar:* the event goes back to the backup's Google copy (a deleted event is brought back, or re-created if Google no longer has it). The next sync brings it into the app, or flags a conflict if the app changed it since.
  - *Both:* each side gets its own copy; an entry whose two copies were in sync when the backup was taken is marked in sync.
  - A pull runs first for Google restores, only items that differ are written, and a backup of the current state is taken first. Google writes stop starting after ~40 s; restoring again carries on.
- **Last-seen events:** deletions (pulled or pushed) now record the event as cancelled in `gcal_event`, so backups compare correctly; migration 0011 repaired existing rows.
- **PWA:** web manifest, icons and a service worker (production builds only). The service worker caches the app shell (hashed assets cache-first, pages network-first) and never caches `/api`. Settings → Install app uses the browser's install prompt, or explains Add to Home Screen on iOS.

## 7. Non-functional requirements

| ID    | Requirement                                                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-1 | **Responsive:** works from 360 px phones up to large desktops. On mobile the default is Day/Schedule view, with a bottom FAB for create and timer. |
| NFR-2 | **Dark mode only** (MUI dark theme, colours close to Google Calendar's dark theme).                                                                |
| NFR-3 | **Cost:** runs on free tiers only (Vercel Hobby plus Supabase Free. Note: Supabase pauses free projects after 7 days of inactivity).               |
| NFR-4 | **Performance:** first load under 2 s on 4G. Views switch instantly because data is cached on the client.                                          |
| NFR-5 | **Accessibility:** keyboard navigable, visible focus, and AA contrast in dark mode.                                                                |
| NFR-6 | **Security:** secrets only in Vercel env vars. `credentials.json` and `token.json` are git-ignored.                                                |

## 8. Technical approach

| Area            | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Language        | TypeScript                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Frontend        | React + Vite (SPA)                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| UI              | [MUI](https://mui.com/) (Material, close to Google Calendar's look), dark theme                                                                                                                                                                                                                                                                                                                                                                                                            |
| Calendar grid   | Custom grid built with MUI components (overlap layout in `src/lib/layout.ts`), so it matches Google Calendar's look and handles overlaps, cross-midnight entries and 5-minute entries the way the existing data needs. |
| Backend         | Vercel Serverless Functions (`/api/*`) in TypeScript                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Google API      | `googleapis`, server-side OAuth 2.0 with a **web** client (`credentials.json` is already set up as a web client)                                                                                                                                                                                                                                                                                                                                                                           |
| Database        | **PostgreSQL** hosted on Supabase (free tier), project `time-tracker` (`zunydbnypttnrcveflmi`, us-east-1). The app talks to it as plain Postgres using a standard driver (`postgres` / `pg`) and `DATABASE_URL`, through Supabase's transaction pooler (port 6543), which is meant for serverless. It does **not** use the Supabase JS client, auth or REST APIs, so the database is easy to move to any other Postgres host. Schema changes are plain SQL migrations in `db/migrations/`. |
| Package manager | Yarn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Testing | **Vitest** with React Testing Library and happy-dom for components. API handlers and sync logic are tested in Vitest too, with Google Calendar mocked and Postgres either mocked or a throwaway test database. |
| Hosting         | Vercel (Hobby/free)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Environment variables

`APP_PASSWORD_HASH`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_CALENDAR_ID`, `TOKEN_ENCRYPTION_KEY`, `DATABASE_URL`

### Google OAuth setup notes

- Authorised redirect URIs must include both `http://localhost:5173/api/google/callback` and `https://<app>.vercel.app/api/google/callback`.
- The consent screen should be **In production**. In Testing mode, refresh tokens expire after 7 days.
- Scope: `https://www.googleapis.com/auth/calendar.events`.

## 9. Development conventions

- **Commits** follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/): `<type>(<scope>)?: <description>`. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Breaking changes use `!` or a `BREAKING CHANGE:` footer. Suggested scopes: `auth`, `sync`, `calendar`, `entries`, `reports`, `shortcuts`, `db`, `ui`.
- **Package manager:** Yarn only (no `package-lock.json`).
- **Tests:** Vitest. `yarn test` runs the suite once; `yarn test:watch` runs it in watch mode; `yarn coverage` produces a coverage report.
  - New features and bug fixes come with tests.
  - Sync, conflict detection (SYNC-5), title normalisation (§5.4) and backup/restore (§5.5) have thorough unit tests, because they risk losing data.
  - Tests never call the real Google Calendar or the production database.
  - The suite must pass before a merge to `main`. Vercel runs it during the build.

## 10. Milestones

1. ✅ **M0 — Scaffold:** Vite + React + TS + MUI dark theme, Yarn, Vitest suite, Vercel config, password login.
2. ✅ **M1 — Entries:** CRUD with database persistence; Day, Week and Schedule views; responsive layout.
3. ✅ **M1b — Editing:** Google Calendar-style date/time controls (§5.2b), entry context menu (§5.2c), Categories page (CAT-7 – CAT-12).
4. ✅ **M2 — Google connect + pull:** OAuth flow, import from the "schedule" calendar.
5. ✅ **M3 — Push + conflict detection + Reconcile UI**, plus pre-sync and daily backups (BAK-1 – BAK-3).
6. ✅ **M4 — Keyboard shortcuts**, Month view, timer, drag and drop (§5.2d).
7. ✅ **M5 — Reporting**, CSV export, PWA install, Backups screen with restore (BAK-4).

## 11. Open questions

### Resolved

- **Database** → PostgreSQL, hosted on Supabase.
- **Categories** → GCal colours, with the inferred names confirmed. The app colour can be changed independently and applies retroactively (§5.2a).
- **Normalisation** → yes, on import, with an alias table that maps titles to canonical activities (§5.4).
- **Touching events the app didn't create** → yes, with 30-day backups (§5.5).
- **Timer** → stored server-side.
- **First import** → full history, from 2026-04-13.
- **End-time am/pm** → follow Google Calendar: inferred from the start time (DT-6).
- **Drag steps** → 15-minute steps from the entry's own time, not snapped to the grid (DRAG-1). Drag and drop stays in M4.

- **Write canonical titles back to GCal** → no; existing events are never renamed (NORM-6).
- **Lavender / Banana** → `tiering` is Leisure; Banana is Exercise, and gym/cardio/exercise are one activity (NORM-7).
- **Activities with several colours** (e.g. `shower`) → the most recent entry's colour wins (NORM-8).

### Still open

_None right now._

## Changelog

| Date       | Change                                                                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-05 | Initial draft.                                                                                                                                                                                                                                        |
| 2026-10-05 | Filled in §2.1 from a review of the calendar; categories = GCal colours; added autocomplete, 5-min snapping and overlap requirements; database → Supabase; added Conventional Commits.                                                                |
| 2026-10-05 | Answered open questions: separate app/GCal category colours, title normalisation and activities, 30-day backups, server-side timer, full-history import. Database → plain PostgreSQL (hosted on Supabase). Expanded §2.1 to cover all sampled months. |
| 2026-10-05 | Resolved the last open questions: no renaming of existing GCal events, exercise aliases → Banana, `tiering` → Leisure, most recent colour wins. |
| 2026-10-05 | Added Vitest test-suite requirement. |
| 2026-10-05 | M0 done: scaffold, MUI dark theme, password login, Vitest. The login rate limit is in memory until Postgres arrives in M1. happy-dom replaces jsdom (current jsdom needs Node ≥ 22.19). |
| 2026-10-05 | M1 done: Postgres schema (migrations 0001–0002, RLS on), entries CRUD API, Day/Week/Schedule views, entry dialog with title autocomplete. Login rate limit now in Postgres. Drag interactions moved to M4. |
| 2026-10-05 | Added Google Calendar-style date/time editing (§5.2b), entry context menu (§5.2c) and a Categories page (CAT-7 – CAT-12), as new milestone M1b. |
| 2026-10-05 | DT-6: the end time's am/pm is inferred from the start time, as Google Calendar does. |
| 2026-10-05 | M1b done: Google Calendar-style date/time editor, right-click/long-press entry menu with undo, Categories page. Added the `backups` table (migration 0003); category delete/merge and move-by-title take a backup first. |
| 2026-10-05 | DT-2: the date picker's calendar marks today. |
| 2026-10-05 | Added drag and drop in the calendar (§5.2d): move, move across days, resize and drag-to-create in 15-minute steps, with undo. |
| 2026-10-05 | DRAG-1: drag moves in 15-minute steps from the entry's own time. |
| 2026-10-05 | M2 done: Google OAuth (connect/disconnect, encrypted tokens), pull with sync tokens, first import with normalisation, aliases and colour → category mapping, conflict capture. Settings page now has a Google Calendar section; toolbar Sync button pulls. Redirect URI is `/api/google/callback`. |
| 2026-10-05 | M3 done: push to Google (SYNC-3), two-way Sync button with summary and conflict badge (SYNC-1, SYNC-8), Reconcile screen (SYNC-7), pre-sync and daily backups (BAK-1, BAK-2). Backups screen (BAK-4) moved to M5. |
| 2026-10-05 | Fixed NORM-8 on import: the most recent colour *that maps to a category* wins. Migrations 0007/0008 repaired 316 imported entries (with a backup) without pushing anything. |
| 2026-10-05 | Push retries Google rate limits with backoff (a bulk CAT-4 recolour had hit them). Added CAT-13; migration 0009 put the 57 uncategorised default-colour entries in Self-care. |
| 2026-10-05 | M4 done: keyboard shortcuts (§5.7) with a help dialog, Go to date and search; Month view; server-side timer (migration 0010); drag to move, resize and create in Day and Week views (§5.2d). The optional custom view (`x` / `4`) was left out. |
| 2026-10-06 | M5 done: Reports page (REP-1 – REP-3), Backups screen with restore to the app, Google Calendar or both (BAK-4), installable PWA. Deletions now record a cancelled last-seen event (migration 0011). |
