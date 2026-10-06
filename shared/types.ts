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

export type TitleSuggestion = {
  title: string;
  /** Category of the most recent entry with this title (NORM-8). */
  categoryId: string | null;
  count: number;
};
