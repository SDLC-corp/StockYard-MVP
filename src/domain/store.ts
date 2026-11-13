import type { DB } from './types';

/**
 * Minimal transactional store. Every write runs against a cloned draft and is
 * committed only if the whole function succeeds, the in-browser stand-in for a
 * database transaction. State is persisted to localStorage when available.
 */
const STORAGE_KEY = 'stockyard-demo-db-v1';

type Listener = () => void;

export interface Store {
  get(): DB;
  transact<T>(fn: (draft: DB) => T): T;
  replace(db: DB): void;
  subscribe(listener: Listener): () => void;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__stockyard_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadPersisted(): DB | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DB) : null;
  } catch {
    return null;
  }
}

export function clearPersisted() {
  try {
    safeStorage()?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function createStore(initial: DB, persist = true): Store {
  let state = initial;
  const listeners = new Set<Listener>();
  const storage = persist ? safeStorage() : null;

  const commit = (next: DB) => {
    state = next;
    if (storage) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* quota or private mode: keep in memory */
      }
    }
    listeners.forEach((l) => l());
  };

  return {
    get: () => state,
    transact<T>(fn: (draft: DB) => T): T {
      const draft = structuredClone(state);
      const result = fn(draft); // throws -> draft discarded (rollback)
      commit(draft);
      return result;
    },
    replace: (db) => commit(db),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
