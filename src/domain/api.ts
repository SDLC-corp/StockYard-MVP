import { useSyncExternalStore } from 'react';
import { buildSeed } from './seed';
import * as svc from './services';
import { clearPersisted, createStore, loadPersisted } from './store';
import { DomainError, type DB, type User } from './types';

/**
 * The application's "API". In this MVP it runs in the browser: each call is a
 * transaction against the store, and permissions are checked inside the service
 * on every write (hiding a button is never the access control).
 */
const persisted = loadPersisted();
export const store = createStore(persisted && persisted.version === 1 ? persisted : buildSeed());

const SESSION_KEY = 'stockyard-session-user';
let sessionUserId: string | null = null;
try {
  sessionUserId = window.sessionStorage.getItem(SESSION_KEY) ?? window.localStorage.getItem(SESSION_KEY);
} catch {
  /* storage unavailable */
}
// Demo deep link: ?as=storekeeper|procurement|approver|admin signs in as that role.
try {
  const as = new URLSearchParams(window.location.search).get('as');
  const demoUser = as ? store.get().users.find((u) => u.username === as.toLowerCase()) : undefined;
  if (demoUser) sessionUserId = demoUser.id;
} catch {
  /* not in a browser */
}
const sessionListeners = new Set<() => void>();

export const session = {
  get: (): User | null => store.get().users.find((u) => u.id === sessionUserId) ?? null,
  login(username: string, password: string): User {
    const u = store.get().users.find((x) => x.username === username.trim().toLowerCase());
    if (!u || password !== 'demo') throw new DomainError('Invalid username or password.', 'AUTH');
    sessionUserId = u.id;
    try {
      window.localStorage.setItem(SESSION_KEY, u.id);
    } catch {
      /* ignore */
    }
    sessionListeners.forEach((l) => l());
    return u;
  },
  logout() {
    sessionUserId = null;
    try {
      window.localStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    sessionListeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    sessionListeners.add(l);
    return () => sessionListeners.delete(l);
  },
};

export function useDb(): DB {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function useSessionUser(): User | null {
  useDb(); // re-render when users change
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}

function call<A extends unknown[], R>(fn: (db: DB, user: User, ...args: A) => R) {
  return (...args: A): R => {
    const user = session.get();
    if (!user) throw new DomainError('Your session has expired. Please sign in again.', 'AUTH');
    return store.transact((db) => fn(db, user, ...args));
  };
}

export const api = {
  stockOperation: call(svc.stockOperation),
  reverseTxn: call(svc.reverseTxn),
  addServiceRecord: call(svc.addServiceRecord),
  requestAdjustment: call(svc.requestAdjustment),
  actOnApproval: call(svc.actOnApproval),
  createPO: call(svc.createPO),
  submitPO: call(svc.submitPO),
  sendPO: call(svc.sendPO),
  cancelPO: call(svc.cancelPO),
  createGateEntry: call(svc.createGateEntry),
  postGoodsReceipt: call(svc.postGoodsReceipt),
  createTransfer: call(svc.createTransfer),
  receiveTransfer: call(svc.receiveTransfer),
  saveItem: call(svc.saveItem),
  saveSupplier: call(svc.saveSupplier),
  saveLocation: call(svc.saveLocation),
  setPeriodStatus: call(svc.setPeriodStatus),
  runReconciliation: call(svc.runReconciliation),
  runExpirySweep: call(svc.runExpirySweep),
  resetDemo() {
    clearPersisted();
    store.replace(buildSeed());
  },
  /** Demo only: corrupt one cached balance so reconciliation has something to find. */
  simulateDrift() {
    const user = session.get();
    if (!user) return;
    svc.requirePerm(user, 'admin.manage');
    store.transact((db) => {
      const b = Object.values(db.balances).find((x) => x.onHand > 0);
      if (b) b.onHand = svc.round(b.onHand + 7);
    });
  },
};

export { svc };
