import { getDb } from '../../db.js';
import { HttpError, authed, json, lastPathSegment, readJson } from '../../http.js';
import { deleteCategory, getCategory, updateCategory } from '../../repositories/categories.js';
import { parseCategoryFields, parseUuid } from '../../validation.js';

/** PATCH /api/categories/:id — rename or recolour. */
export const PATCH = authed(async (request) => {
  const id = parseUuid(lastPathSegment(request));
  const category = await updateCategory(getDb(), id, parseCategoryFields(await readJson(request), { partial: true }));
  if (!category) throw new HttpError(404, 'Category not found');
  return json(category);
});

/**
 * DELETE /api/categories/:id?moveTo=<id|none> — delete, or merge into `moveTo` (CAT-11).
 * `moveTo` is required so entries are never moved by accident.
 */
export const DELETE = authed(async (request) => {
  const id = parseUuid(lastPathSegment(request));
  const moveToParam = new URL(request.url).searchParams.get('moveTo');
  if (moveToParam === null) throw new HttpError(400, 'moveTo is required (a category id, or "none")');
  const moveTo = moveToParam === 'none' ? null : parseUuid(moveToParam, 'moveTo');
  if (moveTo === id) throw new HttpError(400, 'Cannot merge a category into itself');

  const db = getDb();
  if (moveTo !== null && !(await getCategory(db, moveTo))) throw new HttpError(400, 'moveTo category not found');
  const moved = await deleteCategory(db, id, moveTo);
  if (moved === null) throw new HttpError(404, 'Category not found');
  return json({ moved });
});
