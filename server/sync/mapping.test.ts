import { describe, expect, it } from 'vitest';
import { canonicalTitle, classifyEvent, remoteHash, UNTITLED } from './mapping.js';

const aliases = new Map([['gym', 'exercise']]);
const colours = { byColor: new Map([['7', 'leisure']]), defaultCategoryId: 'self-care' };
const base = { id: 'x', summary: 'Gym', start: { dateTime: '2026-10-05T09:00:00-04:00' }, end: { dateTime: '2026-10-05T10:00:00-04:00' } };

describe('mapping', () => {
  it('canonicalises titles', () => {
    expect(canonicalTitle(' GYM ', aliases)).toBe('exercise');
    expect(canonicalTitle(undefined, aliases)).toBe(UNTITLED);
    expect(canonicalTitle('x'.repeat(300), aliases)).toHaveLength(200);
  });

  it('maps colours to categories, with the default for no colour', () => {
    expect(classifyEvent({ ...base, colorId: '7' }, aliases, colours)).toMatchObject({ kind: 'entry', fields: { category_id: 'leisure' } });
    expect(classifyEvent(base, aliases, colours)).toMatchObject({ kind: 'entry', fields: { category_id: 'self-care', title: 'exercise', raw_title: 'Gym' } });
    expect(classifyEvent({ ...base, colorId: '3' }, aliases, colours)).toMatchObject({ kind: 'entry', fields: { category_id: null } });
  });

  it('lets a fixed title category win over the colour (NORM-7)', () => {
    const withTitles = { ...colours, byTitle: new Map([['exercise', 'exercise-cat']]) };
    expect(classifyEvent({ ...base, colorId: '7' }, aliases, withTitles)).toMatchObject({ kind: 'entry', fields: { title: 'exercise', category_id: 'exercise-cat' } });
  });

  it('classifies cancelled, all-day and zero-length events', () => {
    expect(classifyEvent({ id: 'x', status: 'cancelled' }, aliases, colours)).toEqual({ kind: 'removed' });
    expect(classifyEvent({ ...base, start: { date: '2026-10-05' }, end: { date: '2026-10-06' } }, aliases, colours)).toEqual({ kind: 'skip', reason: 'all-day' });
    expect(classifyEvent({ ...base, end: base.start }, aliases, colours)).toEqual({ kind: 'skip', reason: 'zero-length' });
  });

  it('hashes only the fields the app uses', () => {
    expect(remoteHash({ ...base, updated: 'a' })).toBe(remoteHash({ ...base, updated: 'b' }));
    expect(remoteHash({ ...base, colorId: '7' })).not.toBe(remoteHash(base));
  });
});
