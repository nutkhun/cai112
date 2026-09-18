// Keep sign-in usable when a browser blocks persistent storage.
const memory = new Map<string, string | null>();
export const browserStorage = {
  getItem(key: string): string | null {
    if (memory.has(key)) return memory.get(key) ?? null;
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string) {
    memory.set(key, value);
    try { window.localStorage.setItem(key, value); } catch { /* This page keeps its session. */ }
  },
  removeItem(key: string) {
    memory.set(key, null);
    try { window.localStorage.removeItem(key); } catch { /* Do not restore a stale session on this page. */ }
  },
};
