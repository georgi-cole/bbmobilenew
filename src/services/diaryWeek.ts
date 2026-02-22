/**
 * diaryWeek — client-side API service for the Weekly Diary Room Log.
 *
 * All requests go to /api (proxied to http://localhost:4000 in dev via Vite).
 * Admin writes require the x-admin-key header; see server/middleware/adminAuth.js.
 *
 * Feature flag: VITE_FEATURE_DIARY_WEEK (default "true").
 * When the flag is "false" the UI should hide the weekly tab entirely.
 */

import type { DiaryWeek, CreateDiaryWeekPayload, UpdateDiaryWeekPayload } from '../types/diaryWeek';

/** Set VITE_FEATURE_DIARY_WEEK=false in .env to disable the feature entirely. */
export const FEATURE_DIARY_WEEK =
  (import.meta.env.VITE_FEATURE_DIARY_WEEK ?? 'true') !== 'false';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildHeaders(adminKey?: string): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (adminKey) headers['x-admin-key'] = adminKey;
  return headers;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok) {
    const message =
      (json as { error?: string; errors?: string[] }).error ??
      (json as { errors?: string[] }).errors?.join(', ') ??
      `HTTP ${res.status}`;
    throw new Error(message);
  }
  return (json as { data: T }).data;
}

// ─── API functions ────────────────────────────────────────────────────────────

/** List all diary weeks for a season. Pass publishedOnly=true for public view. */
export async function listDiaryWeeks(
  seasonId: string,
  publishedOnly = true,
): Promise<DiaryWeek[]> {
  const params = publishedOnly ? '?publishedOnly=true' : '';
  const res = await fetch(`/api/seasons/${encodeURIComponent(seasonId)}/weeks${params}`);
  return parseResponse<DiaryWeek[]>(res);
}

/** Fetch a single diary week by season + weekNumber. */
export async function getDiaryWeek(
  seasonId: string,
  weekNumber: number,
): Promise<DiaryWeek> {
  const res = await fetch(
    `/api/seasons/${encodeURIComponent(seasonId)}/weeks/${weekNumber}`,
  );
  return parseResponse<DiaryWeek>(res);
}

/** Create a new diary week (admin only). */
export async function createDiaryWeek(
  seasonId: string,
  payload: CreateDiaryWeekPayload,
  adminKey: string,
): Promise<DiaryWeek> {
  const res = await fetch(`/api/seasons/${encodeURIComponent(seasonId)}/weeks`, {
    method: 'POST',
    headers: buildHeaders(adminKey),
    body: JSON.stringify(payload),
  });
  return parseResponse<DiaryWeek>(res);
}

/** Partially update an existing diary week (admin only). */
export async function updateDiaryWeek(
  seasonId: string,
  weekNumber: number,
  payload: UpdateDiaryWeekPayload,
  adminKey: string,
): Promise<DiaryWeek> {
  const res = await fetch(
    `/api/seasons/${encodeURIComponent(seasonId)}/weeks/${weekNumber}`,
    {
      method: 'PATCH',
      headers: buildHeaders(adminKey),
      body: JSON.stringify(payload),
    },
  );
  return parseResponse<DiaryWeek>(res);
}

/** Export a diary week as a JSON blob and trigger a file download. */
export async function exportDiaryWeekJson(
  weekId: string,
  weekNumber: number,
  adminKey?: string,
): Promise<void> {
  const res = await fetch(`/api/weeks/${encodeURIComponent(weekId)}/export?format=json`, {
    headers: adminKey ? buildHeaders(adminKey) : {},
  });
  if (!res.ok) {
    const json = (await res.json()) as { error?: string };
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `diary-week-${weekNumber}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
