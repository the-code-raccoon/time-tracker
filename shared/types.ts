// Types shared by the API and the React app (JSON over the wire: dates are ISO 8601 strings).

export type Category = {
  id: string;
  name: string;
  appColor: string;
  gcalColorId: string | null;
  sortOrder: number;
  entryCount: number;
  totalMinutes: number;
  /** Entries linked to a Google Calendar event (recoloured on the next sync when the GCal colour changes). */
  syncedCount: number;
};

export type CategoryInput = {
  name: string;
  appColor: string;
  gcalColorId: string | null;
};

export type TimeEntry = {
  id: string;
  title: string;
  start: string;
  end: string;
  categoryId: string | null;
  notes: string | null;
  gcalEventId: string | null;
  updatedAt: string;
};

export type TimeEntryInput = {
  title: string;
  start: string;
  end: string;
  categoryId?: string | null;
  notes?: string | null;
};

/** The running timer (TE-5); null when none is running. */
export type Timer = {
  title: string;
  categoryId: string | null;
  startedAt: string;
};

export type TimerInput = {
  title: string;
  categoryId?: string | null;
  /** Defaults to now. */
  startedAt?: string;
};

export type TitleSuggestion = {
  title: string;
  /** Category of the most recent entry with this title (NORM-8). */
  categoryId: string | null;
  count: number;
};

export type GoogleStatus =
  | { configured: false; connected: false }
  | {
      configured: true;
      connected: boolean;
      email: string | null;
      calendarId: string;
      lastPullAt: string | null;
      pendingConflicts: number;
    };

export type PullSummary = {
  full: boolean;
  fetched: number;
  imported: number;
  updated: number;
  deleted: number;
  conflicts: number;
  skipped: number;
  calendarName?: string;
};

export type PushSummary = {
  created: number;
  updated: number;
  deleted: number;
  /** Changed in Google since the last pull; moved to the Reconcile screen. */
  conflicts: number;
  /** Not attempted because the time budget ran out; they go on the next sync. */
  remaining: number;
  failed: { entryId: string; title: string; error: string }[];
};

export type SyncSummary = { pull: PullSummary; push: PushSummary };

/** One side of a conflict (SYNC-7). Google's side is mapped to app fields the same way an import is. */
export type ConflictSide = {
  deleted: boolean;
  title: string | null;
  start: string | null;
  end: string | null;
  categoryId: string | null;
  notes: string | null;
  /** Google's title as typed there. */
  rawTitle?: string | null;
};

export type Conflict = { entryId: string; detectedAt: string; app: ConflictSide; google: ConflictSide };

export type ConflictChoice = 'app' | 'google';

/** REP-1/REP-2: time per category over a range of local days. Minutes are clipped to the range and to each day. */
export type Report = {
  /** One row per local day in the range, keyed by category id ('' = uncategorised). */
  days: { date: string; minutes: Record<string, number> }[];
  categories: { categoryId: string | null; minutes: number; entries: number }[];
  /** Most time first (NORM-5: titles are canonical activities). */
  activities: { title: string; categoryId: string | null; minutes: number; entries: number }[];
};

export type BackupTrigger = 'pre-sync' | 'daily' | 'manual' | 'category-change' | 'bulk-move';

export type BackupSummary = {
  id: string;
  createdAt: string;
  trigger: BackupTrigger;
  description: string | null;
  entryCount: number;
  eventCount: number;
};

/** One side of a backed-up item, as it was when the backup was taken. */
export type BackupCopy = {
  deleted: boolean;
  title: string | null;
  start: string | null;
  end: string | null;
  categoryId: string | null;
  notes: string | null;
  /** Google's copy only: its colour. */
  colorId?: string | null;
};

/** An entry and/or its Google event in a backup (BAK-4). */
export type BackupItem = {
  /** The entry id, or `event:<Google event id>` for an event with no backed-up entry. */
  key: string;
  entryId: string | null;
  eventId: string | null;
  app: BackupCopy | null;
  google: BackupCopy | null;
  /** The copy differs from what the app has now / what Google had at the last sync. */
  appChanged: boolean;
  googleChanged: boolean;
};

export type BackupDetail = BackupSummary & { items: BackupItem[] };

export type RestoreTarget = 'app' | 'google' | 'both';

export type RestoreSummary = {
  /** Entries put back in the app. */
  app: number;
  /** Events written back to Google Calendar. */
  google: number;
  /** Already the same as the backup. */
  unchanged: number;
  /** Not started because the time ran out; restoring again carries on. */
  remaining: number;
  failed: { key: string; title: string; error: string }[];
};
