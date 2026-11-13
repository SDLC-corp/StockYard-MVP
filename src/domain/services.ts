import {
  DomainError,
  ROLE_PERMISSIONS,
  type Adjustment,
  type ApprovalDocType,
  type ApprovalRequest,
  type Balance,
  type Buckets,
  type DB,
  type GoodsReceipt,
  type GRNLine,
  type Item,
  type Location,
  type Lot,
  type LotStatus,
  type Permission,
  type PurchaseOrder,
  type Serial,
  type SerialStatus,
  type StockTxn,
  type Supplier,
  type Transfer,
  type TxnType,
  type User,
} from './types';

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

export const NEAR_EXPIRY_DAYS = 30;

export const round = (n: number, dp = 4) => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

let idCounter = 0;
export const newId = () =>
  `${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const nowIso = () => new Date().toISOString();

export function nextNo(db: DB, prefix: string): string {
  const n = (db.seq[prefix] ?? 0) + 1;
  db.seq[prefix] = n;
  return `${prefix}-${String(n).padStart(5, '0')}`;
}

export function hasPerm(user: User, perm: Permission) {
  return ROLE_PERMISSIONS[user.role].includes(perm);
}

export function requirePerm(user: User, perm: Permission) {
  if (!hasPerm(user, perm)) {
    throw new DomainError(
      `Permission denied: ${user.name} (${user.role}) does not hold "${perm}".`,
      'FORBIDDEN',
    );
  }
}

export function audit(
  db: DB,
  user: User,
  entity: string,
  entityId: string,
  action: string,
  summary: string,
  before?: unknown,
  after?: unknown,
  at = nowIso(),
) {
  db.audit.push({ id: newId(), at, userId: user.id, entity, entityId, action, summary, before, after });
}

const must = <T>(v: T | undefined | null, msg: string): T => {
  if (v === undefined || v === null) throw new DomainError(msg, 'NOT_FOUND');
  return v;
};

export const getItem = (db: DB, id: string) => must(db.items.find((i) => i.id === id), `Item ${id} not found.`);
export const getLocation = (db: DB, id: string) =>
  must(db.locations.find((l) => l.id === id), `Location ${id} not found.`);
export const getLot = (db: DB, id: string) => must(db.lots.find((l) => l.id === id), `Lot ${id} not found.`);

export const balanceKey = (itemId: string, locationId: string, lotId: string | null) =>
  `${itemId}|${locationId}|${lotId ?? '-'}`;

export const available = (b: Buckets) => round(b.onHand - b.reserved - b.blocked);

const zero = (): Buckets => ({ onHand: 0, reserved: 0, blocked: 0, inTransit: 0 });

export function lotStatus(lot: Lot, today = new Date()): LotStatus {
  if (!lot.expiry) return 'ACTIVE';
  const exp = new Date(lot.expiry + 'T23:59:59');
  if (exp.getTime() < today.getTime()) return 'EXPIRED';
  const days = (exp.getTime() - today.getTime()) / 86_400_000;
  return days <= NEAR_EXPIRY_DAYS ? 'NEAR_EXPIRY' : 'ACTIVE';
}

function describe(db: DB, itemId: string, locationId: string, lotId: string | null) {
  const item = getItem(db, itemId);
  const loc = getLocation(db, locationId);
  const lot = lotId ? getLot(db, lotId) : null;
  return `${item.code} "${item.name}" at ${loc.code}${lot ? ` (lot ${lot.lotNo})` : ''}`;
}

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export function itemTotals(db: DB, itemId: string): Buckets & { available: number } {
  const t = zero();
  for (const b of Object.values(db.balances)) {
    if (b.itemId !== itemId) continue;
    t.onHand += b.onHand;
    t.reserved += b.reserved;
    t.blocked += b.blocked;
    t.inTransit += b.inTransit;
  }
  return {
    onHand: round(t.onHand),
    reserved: round(t.reserved),
    blocked: round(t.blocked),
    inTransit: round(t.inTransit),
    available: available(t),
  };
}

export function outstandingPOQty(db: DB, itemId: string) {
  let q = 0;
  for (const po of db.purchaseOrders) {
    if (!['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(po.status)) continue;
    for (const l of po.lines) if (l.itemId === itemId) q += Math.max(0, l.qty - l.receivedQty);
  }
  return round(q);
}

export interface ReplenishmentRow {
  item: Item;
  available: number;
  onOrder: number;
  projected: number;
  avgDailyDemand: number;
  daysOfCover: number | null;
  suggestedQty: number;
  status: 'OK' | 'REORDER' | 'CRITICAL';
}

export function replenishment(db: DB, today = new Date(), windowDays = 30): ReplenishmentRow[] {
  const since = today.getTime() - windowDays * 86_400_000;
  return db.items
    .filter((i) => i.active)
    .map((item) => {
      const totals = itemTotals(db, item.id);
      const onOrder = outstandingPOQty(db, item.id);
      const projected = round(totals.available + onOrder);
      let issued = 0;
      for (const t of db.txns) {
        if (t.itemId !== item.id || new Date(t.at).getTime() < since) continue;
        if (t.type === 'ISSUE' && !t.reversedById) issued += t.qty;
        if (t.type === 'RETURN' && !t.reversedById) issued -= t.qty;
      }
      const avgDailyDemand = round(Math.max(0, issued) / windowDays, 2);
      const daysOfCover = avgDailyDemand > 0 ? round(totals.available / avgDailyDemand, 1) : null;
      let suggestedQty = 0;
      let status: ReplenishmentRow['status'] = 'OK';
      if (projected <= item.reorderPoint) {
        suggestedQty = Math.max(item.reorderQty, round(item.reorderPoint + item.safetyStock - projected));
        status = totals.available <= item.safetyStock ? 'CRITICAL' : 'REORDER';
      }
      return { item, available: totals.available, onOrder, projected, avgDailyDemand, daysOfCover, suggestedQty, status };
    });
}

/* ------------------------------------------------------------------ */
/* Posting service: the single entry point for stock movement         */
/* ------------------------------------------------------------------ */

export interface PostRequest {
  type: TxnType;
  itemId: string;
  locationId: string;
  lotId?: string | null;
  serialIds?: string[];
  /** For OPENING / GRN_RECEIPT / ADJUST_IN of serialised items: serial numbers to create. */
  newSerialNos?: string[];
  qty: number;
  unitCost?: number;
  refType?: string;
  refNo?: string;
  remarks?: string;
  idempotencyKey?: string;
  at?: string;
  /** Target serial state for BLOCK (UNDER_MAINTENANCE or DAMAGED). */
  serialBlockStatus?: SerialStatus;
  /** Reversal only. */
  reversalOf?: StockTxn;
}

const DELTAS: Record<Exclude<TxnType, 'REVERSAL'>, (q: number) => Partial<Buckets>> = {
  OPENING: (q) => ({ onHand: q }),
  GRN_RECEIPT: (q) => ({ onHand: q }),
  RETURN: (q) => ({ onHand: q }),
  ADJUST_IN: (q) => ({ onHand: q }),
  TRANSFER_IN: (q) => ({ onHand: q }),
  ISSUE: (q) => ({ onHand: -q }),
  ADJUST_OUT: (q) => ({ onHand: -q }),
  TRANSFER_OUT: (q) => ({ onHand: -q }),
  SCRAP: (q) => ({ onHand: -q }),
  RESERVE: (q) => ({ reserved: q }),
  UNRESERVE: (q) => ({ reserved: -q }),
  BLOCK: (q) => ({ blocked: q }),
  UNBLOCK: (q) => ({ blocked: -q }),
  TRANSFER_DISPATCH: (q) => ({ inTransit: q }),
  TRANSFER_RECEIVE: (q) => ({ inTransit: -q, onHand: q }),
};

/** Serial state machine per transaction type: allowed from-states and resulting state. null = no serial change. */
const SERIAL_RULES: Record<Exclude<TxnType, 'REVERSAL'>, { from: (SerialStatus | 'NEW')[]; to: SerialStatus } | null> = {
  OPENING: { from: ['NEW'], to: 'AVAILABLE' },
  GRN_RECEIPT: { from: ['NEW'], to: 'AVAILABLE' },
  ADJUST_IN: { from: ['NEW'], to: 'AVAILABLE' },
  RETURN: { from: ['ISSUED'], to: 'AVAILABLE' },
  ISSUE: { from: ['AVAILABLE'], to: 'ISSUED' },
  ADJUST_OUT: { from: ['AVAILABLE'], to: 'SCRAPPED' },
  SCRAP: { from: ['AVAILABLE'], to: 'SCRAPPED' },
  RESERVE: { from: ['AVAILABLE'], to: 'RESERVED' },
  UNRESERVE: { from: ['RESERVED'], to: 'AVAILABLE' },
  BLOCK: { from: ['AVAILABLE'], to: 'UNDER_MAINTENANCE' },
  UNBLOCK: { from: ['UNDER_MAINTENANCE', 'DAMAGED'], to: 'AVAILABLE' },
  TRANSFER_OUT: { from: ['AVAILABLE'], to: 'IN_TRANSIT' },
  TRANSFER_IN: { from: ['IN_TRANSIT'], to: 'AVAILABLE' },
  TRANSFER_DISPATCH: null,
  TRANSFER_RECEIVE: { from: ['IN_TRANSIT'], to: 'AVAILABLE' },
};

const INBOUND_AT_LOCATION: TxnType[] = ['OPENING', 'GRN_RECEIPT', 'ADJUST_IN', 'RETURN', 'TRANSFER_IN', 'TRANSFER_RECEIVE'];
const EXPIRED_ALLOWED: TxnType[] = ['BLOCK', 'UNBLOCK', 'ADJUST_OUT', 'SCRAP', 'REVERSAL'];

export function assertPeriodOpen(db: DB, at: string) {
  const month = at.slice(0, 7);
  const p = db.periods.find((x) => x.month === month);
  if (!p) throw new DomainError(`No accounting period exists for ${month}. Ask an administrator to open it.`, 'PERIOD');
  if (p.status !== 'OPEN')
    throw new DomainError(`Accounting period ${month} is closed; postings dated in that month are blocked.`, 'PERIOD');
}

export function postStock(db: DB, user: User, req: PostRequest): StockTxn {
  // Idempotency: a repeated submission returns the original transaction.
  if (req.idempotencyKey && db.idempotency[req.idempotencyKey]) {
    const existing = db.txns.find((t) => t.id === db.idempotency[req.idempotencyKey!]);
    if (existing) return existing;
  }

  const at = req.at ?? nowIso();
  assertPeriodOpen(db, at);

  const item = getItem(db, req.itemId);
  const loc = getLocation(db, req.locationId);
  const lotId = req.lotId ?? null;
  const qty = round(req.qty);

  if (!(qty > 0)) throw new DomainError(`Quantity must be greater than zero (got ${req.qty}).`, 'VALIDATION');
  if (!item.active && INBOUND_AT_LOCATION.includes(req.type))
    throw new DomainError(`Item ${item.code} is inactive and cannot receive stock.`, 'VALIDATION');

  // Tracking type validation
  if (item.tracking === 'LOT' && !lotId)
    throw new DomainError(`Item ${item.code} is lot-tracked; a lot must be selected.`, 'TRACKING');
  if (item.tracking !== 'LOT' && lotId)
    throw new DomainError(`Item ${item.code} is not lot-tracked; remove the lot.`, 'TRACKING');
  if (item.tracking === 'SERIAL' && !Number.isInteger(qty))
    throw new DomainError(`Serialised item ${item.code} must move in whole units.`, 'TRACKING');

  let lot: Lot | null = null;
  if (lotId) {
    lot = getLot(db, lotId);
    if (lot.itemId !== item.id) throw new DomainError(`Lot ${lot.lotNo} does not belong to ${item.code}.`, 'TRACKING');
    if (lotStatus(lot, new Date(at)) === 'EXPIRED' && !EXPIRED_ALLOWED.includes(req.type)) {
      throw new DomainError(
        `Lot ${lot.lotNo} of ${item.code} expired on ${lot.expiry}; only block, scrap or adjust-out postings are allowed.`,
        'EXPIRED',
      );
    }
  }

  // Deltas
  let deltas: Buckets;
  if (req.type === 'REVERSAL') {
    const o = must(req.reversalOf, 'Reversal requires the original transaction.');
    deltas = { onHand: -o.deltas.onHand, reserved: -o.deltas.reserved, blocked: -o.deltas.blocked, inTransit: -o.deltas.inTransit };
  } else {
    deltas = { ...zero(), ...DELTAS[req.type](qty) };
  }

  // Balance check
  const key = balanceKey(item.id, loc.id, lotId);
  const current: Balance = db.balances[key] ?? { key, itemId: item.id, locationId: loc.id, lotId, ...zero() };
  const next: Balance = {
    ...current,
    onHand: round(current.onHand + deltas.onHand),
    reserved: round(current.reserved + deltas.reserved),
    blocked: round(current.blocked + deltas.blocked),
    inTransit: round(current.inTransit + deltas.inTransit),
  };
  const availDelta = deltas.onHand - deltas.reserved - deltas.blocked;
  const where = describe(db, item.id, loc.id, lotId);
  if (availDelta < 0 && available(next) < 0) {
    throw new DomainError(
      `Insufficient available stock for ${where}: requested ${qty} ${item.uom}, available ${available(current)} ` +
        `(on hand ${current.onHand}, reserved ${current.reserved}, blocked ${current.blocked}).`,
      'INSUFFICIENT',
    );
  }
  for (const b of ['onHand', 'reserved', 'blocked', 'inTransit'] as const) {
    if (next[b] < 0) {
      throw new DomainError(
        `Posting would make ${b} negative for ${where}: current ${current[b]}, change ${round(deltas[b])}.`,
        'NEGATIVE_BUCKET',
      );
    }
  }

  // Transaction row
  const unitCost =
    req.type === 'GRN_RECEIPT' || req.type === 'OPENING' || req.type === 'ADJUST_IN'
      ? round(req.unitCost ?? item.avgCost)
      : req.type === 'REVERSAL'
        ? req.reversalOf!.unitCost
        : item.avgCost;

  const txn: StockTxn = {
    id: newId(),
    no: nextNo(db, 'TXN'),
    type: req.type,
    at,
    userId: user.id,
    itemId: item.id,
    locationId: loc.id,
    lotId,
    serialIds: [],
    qty,
    unitCost,
    deltas,
    refType: req.refType,
    refNo: req.refNo,
    remarks: req.remarks,
    idempotencyKey: req.idempotencyKey,
    reversalOfId: req.reversalOf?.id,
  };

  // Serials
  if (item.tracking === 'SERIAL') {
    if (req.type === 'REVERSAL') {
      txn.serialIds = reverseSerials(db, req.reversalOf!, txn);
    } else {
      const rule = SERIAL_RULES[req.type];
      if (rule === null) {
        txn.serialIds = [...(req.serialIds ?? [])]; // informational only (e.g. in-transit row)
      } else if (rule.from.includes('NEW')) {
        const nos = (req.newSerialNos ?? []).map((s) => s.trim()).filter(Boolean);
        if (nos.length !== qty)
          throw new DomainError(`${item.code} is serialised: ${qty} serial numbers required, ${nos.length} given.`, 'TRACKING');
        if (new Set(nos).size !== nos.length) throw new DomainError('Duplicate serial numbers in this posting.', 'TRACKING');
        for (const sn of nos) {
          if (db.serials.some((s) => s.itemId === item.id && s.serialNo === sn))
            throw new DomainError(`Serial ${sn} already exists for ${item.code}.`, 'TRACKING');
          const serial: Serial = {
            id: newId(),
            itemId: item.id,
            serialNo: sn,
            status: rule.to,
            locationId: loc.id,
            history: [],
            serviceRecords: [],
          };
          serial.history.push({
            at, txnId: txn.id, txnNo: txn.no, type: req.type,
            fromStatus: null, toStatus: rule.to, fromLocationId: null, toLocationId: loc.id, note: req.remarks,
          });
          db.serials.push(serial);
          txn.serialIds.push(serial.id);
        }
      } else {
        const ids = req.serialIds ?? [];
        if (ids.length !== qty)
          throw new DomainError(`${item.code} is serialised: select exactly ${qty} serial(s), ${ids.length} selected.`, 'TRACKING');
        for (const sid of ids) {
          const s = must(db.serials.find((x) => x.id === sid), `Serial ${sid} not found.`);
          if (s.itemId !== item.id) throw new DomainError(`Serial ${s.serialNo} is not a unit of ${item.code}.`, 'TRACKING');
          if (rule) {
            const to = req.type === 'BLOCK' && req.serialBlockStatus ? req.serialBlockStatus : rule.to;
            if (!rule.from.includes(s.status))
              throw new DomainError(
                `Serial ${s.serialNo} is ${s.status}; ${req.type} requires ${rule.from.join(' or ')}.`,
                'SERIAL_STATE',
              );
            const atThisLoc = ['AVAILABLE', 'RESERVED', 'UNDER_MAINTENANCE', 'DAMAGED'].includes(s.status);
            if (atThisLoc && s.locationId !== loc.id) {
              const actual = s.locationId ? getLocation(db, s.locationId).code : 'no location';
              throw new DomainError(`Serial ${s.serialNo} is at ${actual}, not ${loc.code}.`, 'SERIAL_STATE');
            }
            const toLoc = ['ISSUED', 'SCRAPPED', 'IN_TRANSIT'].includes(to) ? null : loc.id;
            s.history.push({
              at, txnId: txn.id, txnNo: txn.no, type: req.type,
              fromStatus: s.status, toStatus: to, fromLocationId: s.locationId, toLocationId: toLoc, note: req.remarks,
            });
            s.status = to;
            s.locationId = toLoc;
          }
          txn.serialIds.push(s.id);
        }
      }
    }
  } else if (req.serialIds?.length || req.newSerialNos?.length) {
    throw new DomainError(`Item ${item.code} is not serialised; remove serial numbers.`, 'TRACKING');
  }

  // Weighted average cost on receipt
  if ((req.type === 'GRN_RECEIPT' || req.type === 'OPENING') && deltas.onHand > 0) {
    const totals = itemTotals(db, item.id);
    const before = item.avgCost;
    const denom = totals.onHand + qty;
    item.avgCost = denom > 0 ? round((totals.onHand * item.avgCost + qty * unitCost) / denom) : unitCost;
    if (before !== item.avgCost)
      audit(db, user, 'Item', item.id, 'COST_UPDATE', `Average cost of ${item.code} ${before} -> ${item.avgCost}`,
        { avgCost: before }, { avgCost: item.avgCost }, at);
  }

  db.balances[key] = next;
  db.txns.push(txn);
  if (req.idempotencyKey) db.idempotency[req.idempotencyKey] = txn.id;
  audit(db, user, 'StockTxn', txn.id, req.type === 'REVERSAL' ? 'REVERSE' : 'POST',
    `${txn.no} ${req.type} ${qty} ${item.uom} ${where}${req.refNo ? ` ref ${req.refNo}` : ''}`,
    { ...current }, { ...next }, at);
  return txn;
}

function reverseSerials(db: DB, original: StockTxn, rev: StockTxn): string[] {
  const out: string[] = [];
  for (const sid of original.serialIds) {
    const s = db.serials.find((x) => x.id === sid);
    if (!s) continue;
    const last = s.history[s.history.length - 1];
    if (!last || last.txnId !== original.id)
      throw new DomainError(
        `Serial ${s.serialNo} has moved since ${original.no}; reverse its later transactions first.`,
        'SERIAL_STATE',
      );
    if (last.fromStatus === null) {
      db.serials = db.serials.filter((x) => x.id !== s.id); // unit never existed
    } else {
      s.history.push({
        at: rev.at, txnId: rev.id, txnNo: rev.no, type: 'REVERSAL',
        fromStatus: s.status, toStatus: last.fromStatus, fromLocationId: s.locationId, toLocationId: last.fromLocationId,
        note: `Reversal of ${original.no}`,
      });
      s.status = last.fromStatus;
      s.locationId = last.fromLocationId;
    }
    out.push(sid);
  }
  return out;
}

const NON_REVERSIBLE: TxnType[] = ['REVERSAL', 'GRN_RECEIPT', 'TRANSFER_OUT', 'TRANSFER_IN', 'TRANSFER_DISPATCH', 'TRANSFER_RECEIVE'];

export function reverseTxn(db: DB, user: User, txnId: string, remarks: string): StockTxn {
  requirePerm(user, 'inventory.post');
  const o = must(db.txns.find((t) => t.id === txnId), 'Transaction not found.');
  if (o.reversedById) throw new DomainError(`${o.no} has already been reversed; a transaction can be reversed only once.`, 'REVERSAL');
  if (NON_REVERSIBLE.includes(o.type))
    throw new DomainError(`${o.type} transactions cannot be reversed directly; correct them through the source document.`, 'REVERSAL');
  if (!remarks?.trim()) throw new DomainError('A reason is required to reverse a transaction.', 'VALIDATION');
  const rev = postStock(db, user, {
    type: 'REVERSAL', itemId: o.itemId, locationId: o.locationId, lotId: o.lotId, qty: o.qty,
    reversalOf: o, refType: 'Reversal', refNo: o.no, remarks,
  });
  o.reversedById = rev.id;
  return rev;
}

/* ------------------------------------------------------------------ */
/* Stock operations (storekeeper)                                      */
/* ------------------------------------------------------------------ */

export interface StockOpInput {
  itemId: string;
  locationId: string;
  lotId?: string | null;
  serialIds?: string[];
  qty: number;
  departmentId?: string;
  workOrder?: string;
  remarks?: string;
  idempotencyKey?: string;
  serialBlockStatus?: SerialStatus;
}

const OP_TYPES = ['ISSUE', 'RETURN', 'RESERVE', 'UNRESERVE', 'BLOCK', 'UNBLOCK', 'SCRAP'] as const;
export type StockOpType = (typeof OP_TYPES)[number];

export function stockOperation(db: DB, user: User, type: StockOpType, input: StockOpInput): StockTxn {
  requirePerm(user, 'inventory.post');
  if (!OP_TYPES.includes(type)) throw new DomainError(`Unsupported operation ${type}.`);
  if ((type === 'ISSUE' || type === 'RETURN') && !input.departmentId)
    throw new DomainError('Select the department the material is issued to / returned from.', 'VALIDATION');
  const dept = input.departmentId ? db.departments.find((d) => d.id === input.departmentId) : undefined;
  return postStock(db, user, {
    type,
    itemId: input.itemId,
    locationId: input.locationId,
    lotId: input.lotId ?? null,
    serialIds: input.serialIds,
    qty: input.qty,
    refType: dept ? 'Department' : undefined,
    refNo: dept ? `${dept.code}${input.workOrder ? ` / WO ${input.workOrder}` : ''}` : input.workOrder,
    remarks: input.remarks,
    idempotencyKey: input.idempotencyKey,
    serialBlockStatus: input.serialBlockStatus,
  });
}

export function addServiceRecord(db: DB, user: User, serialId: string, note: string) {
  requirePerm(user, 'inventory.post');
  const s = must(db.serials.find((x) => x.id === serialId), 'Serial not found.');
  if (!note.trim()) throw new DomainError('Service note is required.', 'VALIDATION');
  s.serviceRecords.push({ at: nowIso(), note, userId: user.id });
  audit(db, user, 'Serial', s.id, 'SERVICE_RECORD', `Service record on ${s.serialNo}: ${note}`);
}

/* ------------------------------------------------------------------ */
/* Approval engine (one engine for all document types)                 */
/* ------------------------------------------------------------------ */

type Handler = { onApproved: (db: DB, actor: User, docId: string) => void; onRejected: (db: DB, actor: User, docId: string) => void };

const APPROVAL_HANDLERS: Record<ApprovalDocType, Handler> = {
  PURCHASE_ORDER: {
    onApproved: (db, _actor, id) => {
      const po = must(db.purchaseOrders.find((p) => p.id === id), 'PO not found.');
      po.status = 'APPROVED';
    },
    onRejected: (db, _actor, id) => {
      const po = must(db.purchaseOrders.find((p) => p.id === id), 'PO not found.');
      po.status = 'REJECTED';
    },
  },
  ADJUSTMENT: {
    onApproved: (db, actor, id) => {
      const adj = must(db.adjustments.find((a) => a.id === id), 'Adjustment not found.');
      const txn = postStock(db, actor, {
        type: adj.qty > 0 ? 'ADJUST_IN' : 'ADJUST_OUT',
        itemId: adj.itemId, locationId: adj.locationId, lotId: adj.lotId, qty: Math.abs(adj.qty),
        unitCost: adj.unitCost, refType: 'Adjustment', refNo: adj.no, remarks: adj.reason,
      });
      adj.status = 'APPROVED';
      adj.txnId = txn.id;
    },
    onRejected: (db, _actor, id) => {
      const adj = must(db.adjustments.find((a) => a.id === id), 'Adjustment not found.');
      adj.status = 'REJECTED';
    },
  },
};

export function submitForApproval(
  db: DB, user: User, docType: ApprovalDocType, docId: string, docNo: string, summary: string, amount: number,
): ApprovalRequest {
  if (db.approvals.some((a) => a.docId === docId && a.status === 'PENDING'))
    throw new DomainError(`${docNo} already has a pending approval request.`, 'APPROVAL');
  const at = nowIso();
  const req: ApprovalRequest = {
    id: newId(), docType, docId, docNo, summary, amount: round(amount, 2), status: 'PENDING',
    requestedBy: user.id, requestedAt: at, history: [{ at, userId: user.id, action: 'SUBMITTED' }],
  };
  db.approvals.push(req);
  audit(db, user, 'Approval', req.id, 'SUBMIT', `${docNo} submitted for approval`);
  return req;
}

export function actOnApproval(db: DB, user: User, approvalId: string, action: 'APPROVED' | 'REJECTED', remarks?: string) {
  requirePerm(user, 'approval.act');
  const req = must(db.approvals.find((a) => a.id === approvalId), 'Approval request not found.');
  if (req.status !== 'PENDING') throw new DomainError(`${req.docNo} was already ${req.status.toLowerCase()}.`, 'APPROVAL');
  if (req.requestedBy === user.id) throw new DomainError('You cannot approve a request you submitted.', 'APPROVAL');
  if (action === 'REJECTED' && !remarks?.trim()) throw new DomainError('Remarks are required when rejecting.', 'VALIDATION');
  const handler = APPROVAL_HANDLERS[req.docType];
  if (action === 'APPROVED') handler.onApproved(db, user, req.docId);
  else handler.onRejected(db, user, req.docId);
  req.status = action;
  req.history.push({ at: nowIso(), userId: user.id, action, remarks });
  audit(db, user, 'Approval', req.id, action, `${req.docNo} ${action.toLowerCase()}${remarks ? `: ${remarks}` : ''}`,
    { status: 'PENDING' }, { status: action });
}

/* ------------------------------------------------------------------ */
/* Adjustments                                                          */
/* ------------------------------------------------------------------ */

export function requestAdjustment(
  db: DB, user: User, input: { itemId: string; locationId: string; lotId?: string | null; qty: number; unitCost?: number; reason: string },
): Adjustment {
  requirePerm(user, 'inventory.post');
  const item = getItem(db, input.itemId);
  if (item.tracking === 'SERIAL') throw new DomainError('Serialised items are adjusted through serial receipt or scrap.', 'VALIDATION');
  if (!input.qty) throw new DomainError('Adjustment quantity cannot be zero.', 'VALIDATION');
  if (!input.reason?.trim()) throw new DomainError('A reason is required for adjustments.', 'VALIDATION');
  const adj: Adjustment = {
    id: newId(), no: nextNo(db, 'ADJ'), itemId: item.id, locationId: input.locationId, lotId: input.lotId ?? null,
    qty: round(input.qty), unitCost: round(input.unitCost ?? item.avgCost), reason: input.reason,
    status: 'PENDING_APPROVAL', createdAt: nowIso(), createdBy: user.id,
  };
  db.adjustments.push(adj);
  audit(db, user, 'Adjustment', adj.id, 'CREATE', `${adj.no} ${adj.qty > 0 ? '+' : ''}${adj.qty} ${item.uom} ${item.code}`);
  submitForApproval(db, user, 'ADJUSTMENT', adj.id, adj.no,
    `${adj.qty > 0 ? 'Increase' : 'Decrease'} ${item.code} by ${Math.abs(adj.qty)} ${item.uom}: ${adj.reason}`,
    Math.abs(adj.qty) * adj.unitCost);
  return adj;
}

/* ------------------------------------------------------------------ */
/* Purchase orders (procurement)                                        */
/* ------------------------------------------------------------------ */

export interface POInput {
  supplierId: string;
  warehouseId: string;
  expectedDate: string;
  remarks?: string;
  lines: { itemId: string; qty: number; unitPrice: number }[];
}

export const poTotal = (po: PurchaseOrder) => round(po.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0), 2);

export function createPO(db: DB, user: User, input: POInput): PurchaseOrder {
  requirePerm(user, 'acquisition.manage');
  must(db.suppliers.find((s) => s.id === input.supplierId), 'Select a supplier.');
  must(db.warehouses.find((w) => w.id === input.warehouseId), 'Select a delivery warehouse.');
  if (!input.lines?.length) throw new DomainError('A purchase order needs at least one line.', 'VALIDATION');
  const seen = new Set<string>();
  for (const l of input.lines) {
    const item = getItem(db, l.itemId);
    if (seen.has(l.itemId)) throw new DomainError(`${item.code} appears on more than one line.`, 'VALIDATION');
    seen.add(l.itemId);
    if (!(l.qty > 0)) throw new DomainError(`Quantity for ${item.code} must be greater than zero.`, 'VALIDATION');
    if (item.tracking === 'SERIAL' && !Number.isInteger(l.qty))
      throw new DomainError(`${item.code} is serialised; order whole units.`, 'VALIDATION');
    if (!(l.unitPrice >= 0)) throw new DomainError(`Unit price for ${item.code} cannot be negative.`, 'VALIDATION');
  }
  const po: PurchaseOrder = {
    id: newId(), no: nextNo(db, 'PO'), supplierId: input.supplierId, warehouseId: input.warehouseId,
    status: 'DRAFT', expectedDate: input.expectedDate, createdAt: nowIso(), createdBy: user.id, remarks: input.remarks,
    lines: input.lines.map((l) => ({ id: newId(), itemId: l.itemId, qty: round(l.qty), unitPrice: round(l.unitPrice, 2), receivedQty: 0, rejectedQty: 0 })),
  };
  db.purchaseOrders.push(po);
  audit(db, user, 'PurchaseOrder', po.id, 'CREATE', `${po.no} created (${po.lines.length} lines, ${poTotal(po)})`, undefined, po);
  return po;
}

export function submitPO(db: DB, user: User, poId: string) {
  requirePerm(user, 'acquisition.manage');
  const po = must(db.purchaseOrders.find((p) => p.id === poId), 'PO not found.');
  if (!['DRAFT', 'REJECTED'].includes(po.status))
    throw new DomainError(`${po.no} is ${po.status}; only draft or rejected orders can be submitted.`, 'STATE');
  const supplier = db.suppliers.find((s) => s.id === po.supplierId);
  po.status = 'PENDING_APPROVAL';
  submitForApproval(db, user, 'PURCHASE_ORDER', po.id, po.no, `${supplier?.name ?? 'Supplier'} - ${po.lines.length} line(s)`, poTotal(po));
}

export function sendPO(db: DB, user: User, poId: string) {
  requirePerm(user, 'acquisition.manage');
  const po = must(db.purchaseOrders.find((p) => p.id === poId), 'PO not found.');
  if (po.status !== 'APPROVED') throw new DomainError(`${po.no} must be approved before it is sent (currently ${po.status}).`, 'STATE');
  po.status = 'SENT';
  audit(db, user, 'PurchaseOrder', po.id, 'SEND', `${po.no} sent to supplier`, { status: 'APPROVED' }, { status: 'SENT' });
}

export function cancelPO(db: DB, user: User, poId: string) {
  requirePerm(user, 'acquisition.manage');
  const po = must(db.purchaseOrders.find((p) => p.id === poId), 'PO not found.');
  if (po.lines.some((l) => l.receivedQty > 0))
    throw new DomainError(`${po.no} has receipts posted and cannot be cancelled.`, 'STATE');
  if (['CANCELLED', 'RECEIVED'].includes(po.status)) throw new DomainError(`${po.no} is already ${po.status}.`, 'STATE');
  const before = po.status;
  po.status = 'CANCELLED';
  for (const a of db.approvals) if (a.docId === po.id && a.status === 'PENDING') a.status = 'REJECTED';
  audit(db, user, 'PurchaseOrder', po.id, 'CANCEL', `${po.no} cancelled`, { status: before }, { status: 'CANCELLED' });
}

/* ------------------------------------------------------------------ */
/* Receiving (storekeeper)                                              */
/* ------------------------------------------------------------------ */

export function createGateEntry(db: DB, user: User, input: { poId: string; vehicleNo: string; driver: string }) {
  requirePerm(user, 'inventory.post');
  const po = must(db.purchaseOrders.find((p) => p.id === input.poId), 'PO not found.');
  if (!['SENT', 'PARTIALLY_RECEIVED'].includes(po.status))
    throw new DomainError(`${po.no} is ${po.status}; deliveries are logged only against sent orders.`, 'STATE');
  if (!input.vehicleNo?.trim()) throw new DomainError('Vehicle number is required.', 'VALIDATION');
  const ge = {
    id: newId(), no: nextNo(db, 'GE'), poId: po.id, vehicleNo: input.vehicleNo.trim().toUpperCase(),
    driver: input.driver?.trim() ?? '', at: nowIso(), userId: user.id, status: 'OPEN' as const,
  };
  db.gateEntries.push(ge);
  audit(db, user, 'GateEntry', ge.id, 'CREATE', `${ge.no} logged for ${po.no} (${ge.vehicleNo})`);
  return ge;
}

export function postGoodsReceipt(
  db: DB, user: User, input: { gateEntryId: string; locationId: string; lines: GRNLine[]; idempotencyKey?: string },
): GoodsReceipt {
  requirePerm(user, 'inventory.post');
  const ge = must(db.gateEntries.find((g) => g.id === input.gateEntryId), 'Gate entry not found.');
  if (ge.status !== 'OPEN') throw new DomainError(`${ge.no} has already been received.`, 'STATE');
  const po = must(db.purchaseOrders.find((p) => p.id === ge.poId), 'PO not found.');
  const loc: Location = getLocation(db, input.locationId);
  if (loc.warehouseId !== po.warehouseId) {
    const wh = db.warehouses.find((w) => w.id === po.warehouseId);
    throw new DomainError(`${po.no} is for delivery to ${wh?.name}; choose a location in that warehouse.`, 'VALIDATION');
  }
  const lines = input.lines.filter((l) => l.receivedQty > 0);
  if (!lines.length) throw new DomainError('Enter a received quantity on at least one line.', 'VALIDATION');

  const grn: GoodsReceipt = {
    id: newId(), no: nextNo(db, 'GRN'), poId: po.id, gateEntryId: ge.id, locationId: loc.id,
    at: nowIso(), userId: user.id, lines: [], txnIds: [],
  };

  lines.forEach((l, i) => {
    const pl = must(po.lines.find((x) => x.id === l.poLineId), 'PO line not found.');
    const item = getItem(db, pl.itemId);
    const received = round(l.receivedQty);
    const accepted = round(l.acceptedQty);
    const rejected = round(l.rejectedQty);
    if (accepted < 0 || rejected < 0) throw new DomainError(`${item.code}: quantities cannot be negative.`, 'VALIDATION');
    if (round(accepted + rejected) !== received)
      throw new DomainError(`${item.code}: accepted (${accepted}) + rejected (${rejected}) must equal received (${received}).`, 'VALIDATION');
    const outstanding = round(pl.qty - pl.receivedQty);
    if (accepted > outstanding)
      throw new DomainError(`${item.code}: accepted ${accepted} exceeds outstanding PO quantity ${outstanding}.`, 'VALIDATION');
    if (rejected > 0 && !l.rejectReason?.trim())
      throw new DomainError(`${item.code}: give a reason for the rejected quantity.`, 'VALIDATION');

    if (accepted > 0) {
      let lotId: string | null = null;
      if (item.tracking === 'LOT') {
        const lotNo = l.lotNo?.trim();
        if (!lotNo) throw new DomainError(`${item.code} is lot-tracked; enter the supplier lot number.`, 'TRACKING');
        let lot = db.lots.find((x) => x.itemId === item.id && x.lotNo === lotNo);
        if (lot && (lot.expiry ?? '') !== (l.expiry ?? ''))
          throw new DomainError(`Lot ${lotNo} already exists for ${item.code} with expiry ${lot.expiry ?? 'none'}.`, 'TRACKING');
        if (!lot) {
          lot = { id: newId(), itemId: item.id, lotNo, expiry: l.expiry || undefined, supplierBatch: lotNo, createdAt: grn.at };
          db.lots.push(lot);
        }
        lotId = lot.id;
      }
      const txn = postStock(db, user, {
        type: 'GRN_RECEIPT', itemId: item.id, locationId: loc.id, lotId, qty: accepted, unitCost: pl.unitPrice,
        newSerialNos: item.tracking === 'SERIAL' ? l.serialNos : undefined,
        refType: 'GRN', refNo: `${grn.no} / ${po.no}`,
        idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:${i}` : undefined,
      });
      grn.txnIds.push(txn.id);
    }
    pl.receivedQty = round(pl.receivedQty + accepted);
    pl.rejectedQty = round(pl.rejectedQty + rejected);
    grn.lines.push({ ...l, itemId: item.id, receivedQty: received, acceptedQty: accepted, rejectedQty: rejected });
  });

  const before = po.status;
  po.status = po.lines.every((l) => l.receivedQty >= l.qty) ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
  ge.status = 'RECEIVED';
  db.goodsReceipts.push(grn);
  audit(db, user, 'GoodsReceipt', grn.id, 'POST', `${grn.no} posted against ${po.no} (${grn.lines.length} lines)`);
  if (before !== po.status)
    audit(db, user, 'PurchaseOrder', po.id, 'STATUS', `${po.no} ${before} -> ${po.status}`, { status: before }, { status: po.status });
  return grn;
}

/* ------------------------------------------------------------------ */
/* Transfers                                                            */
/* ------------------------------------------------------------------ */

export function createTransfer(
  db: DB, user: User,
  input: { mode: 'DIRECT' | 'IN_TRANSIT'; itemId: string; lotId?: string | null; serialIds?: string[]; qty: number; fromLocationId: string; toLocationId: string },
): Transfer {
  requirePerm(user, 'inventory.post');
  if (input.fromLocationId === input.toLocationId) throw new DomainError('Source and destination locations must differ.', 'VALIDATION');
  const tr: Transfer = {
    id: newId(), no: nextNo(db, 'TRF'), mode: input.mode, itemId: input.itemId, lotId: input.lotId ?? null,
    serialIds: input.serialIds ?? [], qty: round(input.qty), fromLocationId: input.fromLocationId, toLocationId: input.toLocationId,
    status: 'DISPATCHED', dispatchedAt: nowIso(), userId: user.id, txnIds: [],
  };
  const common = { itemId: tr.itemId, lotId: tr.lotId, qty: tr.qty, refType: 'Transfer', refNo: tr.no };
  const out = postStock(db, user, { ...common, type: 'TRANSFER_OUT', locationId: tr.fromLocationId, serialIds: tr.serialIds });
  tr.txnIds.push(out.id);
  if (tr.mode === 'DIRECT') {
    const inn = postStock(db, user, { ...common, type: 'TRANSFER_IN', locationId: tr.toLocationId, serialIds: tr.serialIds });
    tr.txnIds.push(inn.id);
    tr.status = 'RECEIVED';
    tr.receivedAt = tr.dispatchedAt;
  } else {
    const disp = postStock(db, user, { ...common, type: 'TRANSFER_DISPATCH', locationId: tr.toLocationId, serialIds: tr.serialIds });
    tr.txnIds.push(disp.id);
  }
  db.transfers.push(tr);
  audit(db, user, 'Transfer', tr.id, 'DISPATCH', `${tr.no} ${tr.mode} ${tr.qty} of ${getItem(db, tr.itemId).code}`);
  return tr;
}

export function receiveTransfer(db: DB, user: User, transferId: string): Transfer {
  requirePerm(user, 'inventory.post');
  const tr = must(db.transfers.find((t) => t.id === transferId), 'Transfer not found.');
  if (tr.status !== 'DISPATCHED') throw new DomainError(`${tr.no} has already been received.`, 'STATE');
  const t = postStock(db, user, {
    type: 'TRANSFER_RECEIVE', itemId: tr.itemId, locationId: tr.toLocationId, lotId: tr.lotId, qty: tr.qty,
    serialIds: tr.serialIds, refType: 'Transfer', refNo: tr.no,
  });
  tr.txnIds.push(t.id);
  tr.status = 'RECEIVED';
  tr.receivedAt = t.at;
  audit(db, user, 'Transfer', tr.id, 'RECEIVE', `${tr.no} received at ${getLocation(db, tr.toLocationId).code}`);
  return tr;
}

/* ------------------------------------------------------------------ */
/* Administration                                                       */
/* ------------------------------------------------------------------ */

export function saveItem(db: DB, user: User, input: Omit<Item, 'id' | 'avgCost'> & { id?: string; avgCost?: number }): Item {
  requirePerm(user, 'admin.manage');
  const code = input.code.trim().toUpperCase();
  if (!code || !input.name.trim()) throw new DomainError('Item code and name are required.', 'VALIDATION');
  if (db.items.some((i) => i.code === code && i.id !== input.id)) throw new DomainError(`Item code ${code} is already in use.`, 'UNIQUE');
  if (input.reorderPoint < 0 || input.safetyStock < 0 || input.reorderQty < 0)
    throw new DomainError('Planning parameters cannot be negative.', 'VALIDATION');
  if (input.id) {
    const item = getItem(db, input.id);
    const hasStock = db.txns.some((t) => t.itemId === item.id);
    if (hasStock && item.tracking !== input.tracking)
      throw new DomainError(`Tracking type of ${item.code} cannot change after stock has been posted.`, 'VALIDATION');
    const before = { ...item };
    Object.assign(item, { ...input, code, avgCost: item.avgCost });
    audit(db, user, 'Item', item.id, 'UPDATE', `${item.code} updated`, before, { ...item });
    return item;
  }
  const item: Item = { ...input, code, id: newId(), avgCost: input.avgCost ?? 0 };
  db.items.push(item);
  audit(db, user, 'Item', item.id, 'CREATE', `${item.code} created`, undefined, item);
  return item;
}

export function saveSupplier(db: DB, user: User, input: Omit<Supplier, 'id'> & { id?: string }): Supplier {
  requirePerm(user, 'admin.manage');
  const code = input.code.trim().toUpperCase();
  if (!code || !input.name.trim()) throw new DomainError('Supplier code and name are required.', 'VALIDATION');
  if (db.suppliers.some((s) => s.code === code && s.id !== input.id)) throw new DomainError(`Supplier code ${code} is already in use.`, 'UNIQUE');
  if (input.id) {
    const s = must(db.suppliers.find((x) => x.id === input.id), 'Supplier not found.');
    const before = { ...s };
    Object.assign(s, { ...input, code });
    audit(db, user, 'Supplier', s.id, 'UPDATE', `${s.code} updated`, before, { ...s });
    return s;
  }
  const s: Supplier = { ...input, code, id: newId() };
  db.suppliers.push(s);
  audit(db, user, 'Supplier', s.id, 'CREATE', `${s.code} created`, undefined, s);
  return s;
}

export function saveLocation(db: DB, user: User, input: { warehouseId: string; code: string; name: string }): Location {
  requirePerm(user, 'admin.manage');
  const code = input.code.trim().toUpperCase();
  if (!code) throw new DomainError('Location code is required.', 'VALIDATION');
  if (db.locations.some((l) => l.code === code)) throw new DomainError(`Location ${code} already exists.`, 'UNIQUE');
  must(db.warehouses.find((w) => w.id === input.warehouseId), 'Warehouse not found.');
  const loc: Location = { id: newId(), warehouseId: input.warehouseId, code, name: input.name.trim() || code };
  db.locations.push(loc);
  audit(db, user, 'Location', loc.id, 'CREATE', `${loc.code} created`);
  return loc;
}

export function setPeriodStatus(db: DB, user: User, month: string, status: 'OPEN' | 'CLOSED') {
  requirePerm(user, 'admin.manage');
  let p = db.periods.find((x) => x.month === month);
  if (!p) {
    p = { month, status };
    db.periods.push(p);
    db.periods.sort((a, b) => a.month.localeCompare(b.month));
    audit(db, user, 'Period', month, 'CREATE', `Period ${month} created as ${status}`);
    return;
  }
  const before = p.status;
  p.status = status;
  audit(db, user, 'Period', month, status === 'OPEN' ? 'REOPEN' : 'CLOSE', `Period ${month} ${before} -> ${status}`,
    { status: before }, { status });
}

export interface ReconMismatch {
  key: string;
  itemId: string;
  locationId: string;
  lotId: string | null;
  cached: Buckets;
  rebuilt: Buckets;
}

/** Rebuild balances from the immutable ledger and compare with cached values. */
export function reconcile(db: DB): { checked: number; mismatches: ReconMismatch[] } {
  const rebuilt: Record<string, Buckets & { itemId: string; locationId: string; lotId: string | null }> = {};
  for (const t of db.txns) {
    const k = balanceKey(t.itemId, t.locationId, t.lotId);
    const b = (rebuilt[k] ??= { itemId: t.itemId, locationId: t.locationId, lotId: t.lotId, ...zero() });
    b.onHand += t.deltas.onHand;
    b.reserved += t.deltas.reserved;
    b.blocked += t.deltas.blocked;
    b.inTransit += t.deltas.inTransit;
  }
  const keys = new Set([...Object.keys(rebuilt), ...Object.keys(db.balances)]);
  const mismatches: ReconMismatch[] = [];
  for (const k of keys) {
    const c = db.balances[k];
    const r = rebuilt[k];
    const cb: Buckets = c ? { onHand: c.onHand, reserved: c.reserved, blocked: c.blocked, inTransit: c.inTransit } : zero();
    const rb: Buckets = r ? { onHand: round(r.onHand), reserved: round(r.reserved), blocked: round(r.blocked), inTransit: round(r.inTransit) } : zero();
    if ((['onHand', 'reserved', 'blocked', 'inTransit'] as const).some((f) => round(cb[f]) !== rb[f])) {
      const [itemId, locationId, lot] = k.split('|');
      mismatches.push({ key: k, itemId, locationId, lotId: lot === '-' ? null : lot, cached: cb, rebuilt: rb });
    }
  }
  return { checked: keys.size, mismatches };
}

export function runReconciliation(db: DB, user: User, fix: boolean) {
  requirePerm(user, 'admin.manage');
  const result = reconcile(db);
  if (fix) {
    for (const m of result.mismatches) {
      db.balances[m.key] = { key: m.key, itemId: m.itemId, locationId: m.locationId, lotId: m.lotId, ...m.rebuilt };
    }
  }
  audit(db, user, 'Ledger', 'reconciliation', fix ? 'RECONCILE_FIX' : 'RECONCILE',
    `Reconciliation checked ${result.checked} balances, ${result.mismatches.length} mismatch(es)${fix && result.mismatches.length ? ' corrected' : ''}`);
  return result;
}

/** Block remaining available quantity on expired lots. */
export function runExpirySweep(db: DB, user: User): number {
  requirePerm(user, 'admin.manage');
  let count = 0;
  const today = new Date();
  for (const lot of db.lots) {
    if (lotStatus(lot, today) !== 'EXPIRED') continue;
    for (const b of Object.values(db.balances)) {
      if (b.lotId !== lot.id) continue;
      const avail = available(b);
      if (avail > 0) {
        postStock(db, user, {
          type: 'BLOCK', itemId: b.itemId, locationId: b.locationId, lotId: lot.id, qty: avail,
          refType: 'Expiry sweep', refNo: lot.lotNo, remarks: `Lot expired ${lot.expiry}`,
        });
        count++;
      }
    }
  }
  audit(db, user, 'Job', 'expiry-sweep', 'RUN', `Expiry sweep blocked ${count} balance(s)`);
  return count;
}
