import type { BackupTrigger } from '../../shared/types';

export const TRIGGER_LABELS: Record<BackupTrigger, string> = {
  daily: 'Daily backup',
  'pre-sync': 'Before a sync',
  manual: 'Manual',
  'category-change': 'Category change',
  'bulk-move': 'Move by title',
};
