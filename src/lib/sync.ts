import type { PullSummary, SyncSummary } from '../../shared/types';

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** "Imported 2,431 entries · 3 need reconciling", or "Already up to date". */
export function formatPullSummary(summary: PullSummary): string {
  const parts = [
    summary.imported > 0 && `Imported ${plural(summary.imported, 'entry', 'entries')}`,
    summary.updated > 0 && `updated ${summary.updated.toLocaleString()}`,
    summary.deleted > 0 && `removed ${summary.deleted.toLocaleString()}`,
  ].filter(Boolean) as string[];
  const text = parts.length > 0 ? parts.join(', ') : 'Already up to date';
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  return summary.conflicts > 0 ? `${sentence} · ${plural(summary.conflicts, 'entry needs', 'entries need')} reconciling` : sentence;
}

/** SYNC-8: "3 from Google, 2 to Google · 1 needs reconciling", or "Already up to date". */
export function formatSyncSummary({ pull, push }: SyncSummary): string {
  const pulled = pull.imported + pull.updated + pull.deleted;
  const pushed = push.created + push.updated + push.deleted;
  const conflicts = pull.conflicts + push.conflicts;
  const parts = [
    pulled > 0 && `${pulled.toLocaleString()} from Google`,
    pushed > 0 && `${pushed.toLocaleString()} to Google`,
  ].filter(Boolean) as string[];
  let text = parts.length > 0 ? `Synced ${parts.join(', ')}` : 'Already up to date';
  if (push.remaining > 0) text += ` · ${push.remaining.toLocaleString()} more on the next sync`;
  if (push.failed.length > 0) text += ` · ${plural(push.failed.length, 'change')} failed`;
  if (conflicts > 0) text += ` · ${plural(conflicts, 'entry needs', 'entries need')} reconciling`;
  return text;
}
