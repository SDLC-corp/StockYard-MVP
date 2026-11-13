import { describe, expect, it } from 'vitest';
import { buildSeed, DEMO_USERS } from './seed';
import * as svc from './services';
import type { DB } from './types';

const [sk, proc, appr, admin] = DEMO_USERS;
const fresh = (): DB => buildSeed(new Date());
const bal = (db: DB, itemId: string, locId: string, lotId: string | null = null) =>
  db.balances[svc.balanceKey(itemId, locId, lotId)];

describe('seed', () => {
  it('builds a ledger that reconciles with cached balances', () => {
    const db = fresh();
    expect(db.txns.length).toBeGreaterThan(20);
    expect(svc.reconcile(db).mismatches).toEqual([]);
  });
});

describe('posting service', () => {
  it('rejects issues above available quantity with a specific message', () => {
    const db = fresh();
    // BRG at A01: 120 - 35 issued = 85 on hand, 10 reserved -> 75 available
    expect(() =>
      svc.stockOperation(db, sk, 'ISSUE', { itemId: 'i-brg', locationId: 'l-a01', qty: 80, departmentId: 'd-maint' }),
    ).toThrow(/requested 80 EA, available 75 \(on hand 85, reserved 10, blocked 0\)/);
  });

  it('is idempotent on repeated submissions', () => {
    const db = fresh();
    const input = { itemId: 'i-hlm', locationId: 'l-a01', qty: 2, departmentId: 'd-fac', idempotencyKey: 'k-1' };
    const a = svc.stockOperation(db, sk, 'ISSUE', input);
    const b = svc.stockOperation(db, sk, 'ISSUE', input);
    expect(b.id).toBe(a.id);
    expect(bal(db, 'i-hlm', 'l-a01').onHand).toBe(14);
  });

  it('allows a transaction to be reversed exactly once', () => {
    const db = fresh();
    const t = svc.stockOperation(db, sk, 'ISSUE', { itemId: 'i-hlm', locationId: 'l-a01', qty: 4, departmentId: 'd-fac' });
    svc.reverseTxn(db, sk, t.id, 'Wrong department');
    expect(bal(db, 'i-hlm', 'l-a01').onHand).toBe(16);
    expect(() => svc.reverseTxn(db, sk, t.id, 'again')).toThrow(/only once/);
  });

  it('blocks outbound postings from expired lots', () => {
    const db = fresh();
    expect(() =>
      svc.stockOperation(db, sk, 'ISSUE', { itemId: 'i-buf', locationId: 'l-b01', lotId: 'lot-buf0', qty: 1, departmentId: 'd-lab' }),
    ).toThrow(/expired/);
    expect(svc.runExpirySweep(db, admin)).toBe(1);
    expect(bal(db, 'i-buf', 'l-b01', 'lot-buf0').blocked).toBe(6);
  });

  it('blocks postings into closed periods', () => {
    const db = fresh();
    const month = new Date().toISOString().slice(0, 7);
    svc.setPeriodStatus(db, admin, month, 'CLOSED');
    expect(() =>
      svc.stockOperation(db, sk, 'ISSUE', { itemId: 'i-hlm', locationId: 'l-a01', qty: 1, departmentId: 'd-fac' }),
    ).toThrow(/closed/);
  });

  it('enforces permissions on the server side', () => {
    const db = fresh();
    expect(() =>
      svc.stockOperation(db, proc, 'ISSUE', { itemId: 'i-hlm', locationId: 'l-a01', qty: 1, departmentId: 'd-fac' }),
    ).toThrow(/Permission denied/);
  });

  it('tracks serial state and refuses invalid transitions', () => {
    const db = fresh();
    const lt4 = db.serials.find((s) => s.serialNo === 'LT-24004')!;
    expect(lt4.status).toBe('ISSUED');
    expect(() =>
      svc.stockOperation(db, sk, 'ISSUE', { itemId: 'i-lap', locationId: 'l-a02', qty: 1, serialIds: [lt4.id], departmentId: 'd-it' }),
    ).toThrow(/is ISSUED/);
    svc.stockOperation(db, sk, 'RETURN', { itemId: 'i-lap', locationId: 'l-a02', qty: 1, serialIds: [lt4.id], departmentId: 'd-it' });
    expect(db.serials.find((s) => s.id === lt4.id)!.status).toBe('AVAILABLE');
  });
});

describe('procure to stock', () => {
  it('runs PO -> approval -> gate entry -> GRN with rejection and recalculates average cost', () => {
    const db = fresh();
    const po = db.purchaseOrders.find((p) => p.status === 'SENT')!;
    const ge = svc.createGateEntry(db, sk, { poId: po.id, vehicleNo: 'mh12 xy 1', driver: 'D' });
    const brgLine = po.lines.find((l) => l.itemId === 'i-brg')!;
    const before = svc.itemTotals(db, 'i-brg').onHand;
    svc.postGoodsReceipt(db, sk, {
      gateEntryId: ge.id, locationId: 'l-a01',
      lines: [{ poLineId: brgLine.id, itemId: 'i-brg', receivedQty: 60, acceptedQty: 55, rejectedQty: 5, rejectReason: 'Rusted' }],
    });
    expect(svc.itemTotals(db, 'i-brg').onHand).toBe(before + 55);
    expect(brgLine.receivedQty).toBe(55);
    expect(po.status).toBe('PARTIALLY_RECEIVED');
    const brg = db.items.find((i) => i.id === 'i-brg')!;
    expect(brg.avgCost).toBeLessThan(4.2);
    expect(brg.avgCost).toBeGreaterThan(4.1);
  });

  it('does not let a requester approve their own request', () => {
    const db = fresh();
    const pending = db.approvals.find((a) => a.status === 'PENDING')!;
    expect(() => svc.actOnApproval(db, { ...appr, id: pending.requestedBy }, pending.id, 'APPROVED')).toThrow(/you submitted/);
  });
});

describe('transfers', () => {
  it('counts in-transit stock only in IN_TRANSIT until received', () => {
    const db = fresh();
    const tr = db.transfers.find((t) => t.status === 'DISPATCHED')!;
    expect(bal(db, 'i-oil', 'l-n01', 'lot-oil1').inTransit).toBe(50);
    expect(bal(db, 'i-oil', 'l-n01', 'lot-oil1').onHand).toBe(80);
    svc.receiveTransfer(db, sk, tr.id);
    expect(bal(db, 'i-oil', 'l-n01', 'lot-oil1').inTransit).toBe(0);
    expect(bal(db, 'i-oil', 'l-n01', 'lot-oil1').onHand).toBe(130);
    expect(svc.reconcile(db).mismatches).toEqual([]);
  });
});
