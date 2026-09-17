const PREFIX = 'cai112-dismissed-due:v1:';
const CHANGE_EVENT = 'cai112-due-dismissed';
const fallback = new Map<string, string>();

export const dueNotificationKey = (assignment: { id: string; due_date: string }) =>
  JSON.stringify([assignment.id, assignment.due_date]);

export function dismissalSnapshot(studentId?: string): string {
  if (!studentId) return '[]';
  const key = PREFIX + studentId;
  if (fallback.has(key)) return fallback.get(key)!;
  try {
    return window.localStorage.getItem(key) ?? fallback.get(key) ?? '[]';
  } catch {
    return fallback.get(key) ?? '[]';
  }
}

export function parseDismissals(snapshot: string): Set<string> {
  try {
    const values: unknown = JSON.parse(snapshot);
    return new Set(Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : []);
  } catch {
    return new Set();
  }
}

export function dismissDueNotifications(studentId: string, keys: string[]) {
  const dismissed = parseDismissals(dismissalSnapshot(studentId));
  keys.forEach(key => dismissed.add(key));
  const snapshot = JSON.stringify([...dismissed]);
  const key = PREFIX + studentId;
  try {
    window.localStorage.setItem(key, snapshot);
    fallback.delete(key);
  } catch {
    // Keep dismissals for this page when browser storage is unavailable.
    fallback.set(key, snapshot);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeToDismissals(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}
