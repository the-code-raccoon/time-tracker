import type { PullSummary } from '../../shared/types';

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
