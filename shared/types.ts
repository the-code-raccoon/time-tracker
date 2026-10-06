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
