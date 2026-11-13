import {
  actOnApproval,
  addServiceRecord,
  createGateEntry,
  createPO,
  createTransfer,
  postGoodsReceipt,
  postStock,
  requestAdjustment,
  sendPO,
  submitPO,
} from './services';
import type { DB, Item, User } from './types';

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString();
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

export const DEMO_USERS: User[] = [
  { id: 'u-store', username: 'storekeeper', name: 'Sam Patel', role: 'STOREKEEPER', departmentId: 'd-stores' },
  { id: 'u-proc', username: 'procurement', name: 'Priya Nair', role: 'PROCUREMENT', departmentId: 'd-proc' },
  { id: 'u-appr', username: 'approver', name: 'Alex Morgan', role: 'APPROVER', departmentId: 'd-fin' },
  { id: 'u-admin', username: 'admin', name: 'Jordan Lee', role: 'ADMIN', departmentId: 'd-it' },
];

export function emptyDb(): DB {
  return {
    version: 1, seq: {}, users: [], departments: [], items: [], suppliers: [], warehouses: [], locations: [],
    lots: [], serials: [], balances: {}, txns: [], idempotency: {}, purchaseOrders: [], gateEntries: [],
    goodsReceipts: [], transfers: [], adjustments: [], approvals: [], audit: [], periods: [],
  };
}

export function buildSeed(today = new Date()): DB {
  const db = emptyDb();
  const ago = (n: number) => iso(new Date(today.getTime() - n * DAY));
  const inDays = (n: number) => dateOnly(new Date(today.getTime() + n * DAY));

  db.users = DEMO_USERS.map((u) => ({ ...u }));
  const [sk, proc, appr] = db.users;

  // Accounting periods: six months back through next month, all open while seeding.
  for (let i = -6; i <= 1; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    db.periods.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, status: 'OPEN' });
  }

  db.departments = [
    { id: 'd-maint', code: 'MAINT', name: 'Maintenance' },
    { id: 'd-prod', code: 'PROD', name: 'Production' },
    { id: 'd-lab', code: 'LAB', name: 'Quality Lab' },
    { id: 'd-it', code: 'IT', name: 'IT Services' },
    { id: 'd-fac', code: 'FAC', name: 'Facilities' },
    { id: 'd-stores', code: 'STORES', name: 'Central Stores' },
    { id: 'd-proc', code: 'PROC', name: 'Procurement' },
    { id: 'd-fin', code: 'FIN', name: 'Finance' },
  ];
  db.warehouses = [
    { id: 'w-main', code: 'WH-MAIN', name: 'Main Warehouse' },
    { id: 'w-north', code: 'WH-NORTH', name: 'North Depot' },
  ];
  db.locations = [
    { id: 'l-a01', warehouseId: 'w-main', code: 'MAIN-A01', name: 'Main / Rack A-01' },
    { id: 'l-a02', warehouseId: 'w-main', code: 'MAIN-A02', name: 'Main / Rack A-02' },
    { id: 'l-b01', warehouseId: 'w-main', code: 'MAIN-B01', name: 'Main / Cold store B-01' },
    { id: 'l-n01', warehouseId: 'w-north', code: 'NRT-01', name: 'North / Bay 01' },
  ];
  db.suppliers = [
    { id: 's-acme', code: 'SUP-ACME', name: 'Acme Industrial Supply', email: 'orders@acme.example', leadTimeDays: 7 },
    { id: 's-medi', code: 'SUP-MEDI', name: 'MediLab Distributors', email: 'sales@medilab.example', leadTimeDays: 5 },
    { id: 's-tech', code: 'SUP-TECH', name: 'TechSource Electronics', email: 'b2b@techsource.example', leadTimeDays: 10 },
    { id: 's-safe', code: 'SUP-SAFE', name: 'SafeGuard PPE', email: 'hello@safeguard.example', leadTimeDays: 4 },
  ];
  const mk = (id: string, code: string, name: string, group: string, uom: string, tracking: Item['tracking'],
    safetyStock: number, reorderPoint: number, reorderQty: number): Item =>
    ({ id, code, name, group, uom, tracking, safetyStock, reorderPoint, reorderQty, avgCost: 0, active: true });
  db.items = [
    mk('i-brg', 'BRG-6205', 'Ball bearing 6205-2RS', 'Spares', 'EA', 'NONE', 20, 40, 100),
    mk('i-glv', 'GLV-NIT-M', 'Nitrile gloves, medium (box/100)', 'PPE', 'BOX', 'LOT', 10, 25, 50),
    mk('i-buf', 'RGT-BUF-7', 'pH 7.00 buffer solution 500 ml', 'Lab reagents', 'BTL', 'LOT', 5, 12, 24),
    mk('i-oil', 'OIL-HYD-46', 'Hydraulic oil ISO VG 46', 'Consumables', 'L', 'LOT', 50, 120, 200),
    mk('i-lap', 'LAP-14-PRO', 'Laptop 14" Pro', 'IT assets', 'EA', 'SERIAL', 1, 3, 4),
    mk('i-tqw', 'TQW-200', 'Torque wrench 40-200 Nm', 'Tools', 'EA', 'SERIAL', 1, 2, 2),
    mk('i-hlm', 'HLM-SAFE', 'Safety helmet, class E', 'PPE', 'EA', 'NONE', 15, 30, 60),
    mk('i-cbl', 'CBL-CU-2.5', 'Copper cable 2.5 mm²', 'Electrical', 'M', 'NONE', 100, 300, 500),
    mk('i-flt', 'FLT-AIR-01', 'Air filter cartridge', 'Spares', 'EA', 'NONE', 6, 12, 24),
  ];

  const lot = (id: string, itemId: string, lotNo: string, expiry?: string) =>
    db.lots.push({ id, itemId, lotNo, expiry, supplierBatch: lotNo, createdAt: ago(45) });
  lot('lot-glv1', 'i-glv', 'GLV-2401', inDays(200));
  lot('lot-glv0', 'i-glv', 'GLV-2312', inDays(18));
  lot('lot-buf0', 'i-buf', 'BUF-0921', inDays(-5));
  lot('lot-buf1', 'i-buf', 'BUF-1104', inDays(90));
  lot('lot-oil1', 'i-oil', 'HO-7781', inDays(365));

  // Opening stock: posted through the posting service so the ledger is the source of truth.
  const open = (itemId: string, locationId: string, qty: number, unitCost: number, lotId: string | null = null, serials?: string[]) =>
    postStock(db, sk, { type: 'OPENING', itemId, locationId, qty, unitCost, lotId, newSerialNos: serials, refType: 'Opening', refNo: 'Go-live', at: ago(45) });
  open('i-brg', 'l-a01', 120, 4.2);
  open('i-glv', 'l-a02', 40, 7.5, 'lot-glv1');
  open('i-glv', 'l-a02', 15, 7.2, 'lot-glv0');
  open('i-buf', 'l-b01', 6, 18, 'lot-buf0');
  open('i-buf', 'l-b01', 10, 18.4, 'lot-buf1');
  open('i-oil', 'l-a01', 300, 3.1, 'lot-oil1');
  open('i-oil', 'l-n01', 80, 3.1, 'lot-oil1');
  open('i-lap', 'l-a02', 4, 1150, null, ['LT-24001', 'LT-24002', 'LT-24003', 'LT-24004']);
  open('i-tqw', 'l-n01', 2, 240, null, ['TW-881', 'TW-882']);
  open('i-hlm', 'l-a01', 22, 12);
  open('i-hlm', 'l-n01', 10, 12);
  open('i-cbl', 'l-b01', 1200, 0.85);
  open('i-flt', 'l-a01', 5, 22);

  // Recent consumption (demand history for replenishment).
  const issue = (itemId: string, locationId: string, qty: number, daysAgo: number, dept: string, lotId: string | null = null, serialIds?: string[]) =>
    postStock(db, sk, { type: 'ISSUE', itemId, locationId, qty, lotId, serialIds, at: ago(daysAgo), refType: 'Department', refNo: dept });
  issue('i-brg', 'l-a01', 8, 28, 'MAINT / WO 5521');
  issue('i-brg', 'l-a01', 12, 20, 'MAINT / WO 5560');
  issue('i-brg', 'l-a01', 6, 10, 'MAINT / WO 5602');
  issue('i-brg', 'l-a01', 9, 3, 'MAINT / WO 5631');
  issue('i-glv', 'l-a02', 5, 25, 'LAB', 'lot-glv1');
  issue('i-glv', 'l-a02', 6, 14, 'LAB', 'lot-glv1');
  issue('i-glv', 'l-a02', 4, 2, 'LAB', 'lot-glv1');
  issue('i-oil', 'l-a01', 40, 22, 'PROD / WO 7710', 'lot-oil1');
  issue('i-oil', 'l-a01', 35, 8, 'PROD / WO 7744', 'lot-oil1');
  issue('i-hlm', 'l-a01', 6, 12, 'FAC');
  issue('i-cbl', 'l-b01', 150, 9, 'FAC / WO 3120');
  issue('i-flt', 'l-a01', 4, 6, 'MAINT / WO 5617');
  const lt4 = db.serials.find((s) => s.serialNo === 'LT-24004')!;
  issue('i-lap', 'l-a02', 1, 15, 'IT', null, [lt4.id]);
  postStock(db, sk, { type: 'RESERVE', itemId: 'i-brg', locationId: 'l-a01', qty: 10, at: ago(1), refType: 'Work order', refNo: 'WO 5650', remarks: 'Planned overhaul, line 3' });
  const tw2 = db.serials.find((s) => s.serialNo === 'TW-882')!;
  postStock(db, sk, { type: 'BLOCK', itemId: 'i-tqw', locationId: 'l-n01', qty: 1, serialIds: [tw2.id], serialBlockStatus: 'UNDER_MAINTENANCE', at: ago(4), remarks: 'Calibration due' });
  addServiceRecord(db, sk, tw2.id, 'Sent for annual calibration; reading drift +4% at 150 Nm.');

  // Procurement pipeline through the real services and the approval engine.
  const po1 = createPO(db, proc, {
    supplierId: 's-acme', warehouseId: 'w-main', expectedDate: inDays(3), remarks: 'Monthly spares replenishment',
    lines: [{ itemId: 'i-brg', qty: 100, unitPrice: 4.1 }, { itemId: 'i-flt', qty: 24, unitPrice: 21.5 }],
  });
  submitPO(db, proc, po1.id);
  actOnApproval(db, appr, db.approvals.find((a) => a.docId === po1.id)!.id, 'APPROVED', 'Within budget');
  sendPO(db, proc, po1.id);

  const po2 = createPO(db, proc, {
    supplierId: 's-safe', warehouseId: 'w-main', expectedDate: inDays(6),
    lines: [{ itemId: 'i-hlm', qty: 60, unitPrice: 11.8 }, { itemId: 'i-glv', qty: 50, unitPrice: 7.4 }],
  });
  submitPO(db, proc, po2.id);

  createPO(db, proc, {
    supplierId: 's-medi', warehouseId: 'w-main', expectedDate: inDays(10),
    lines: [{ itemId: 'i-buf', qty: 24, unitPrice: 17.5 }],
  });

  const po4 = createPO(db, proc, {
    supplierId: 's-tech', warehouseId: 'w-main', expectedDate: inDays(-1),
    lines: [{ itemId: 'i-lap', qty: 2, unitPrice: 1120 }],
  });
  submitPO(db, proc, po4.id);
  actOnApproval(db, appr, db.approvals.find((a) => a.docId === po4.id)!.id, 'APPROVED');
  sendPO(db, proc, po4.id);
  const ge = createGateEntry(db, sk, { poId: po4.id, vehicleNo: 'KA01 AB 4521', driver: 'R. Kumar' });
  postGoodsReceipt(db, sk, {
    gateEntryId: ge.id, locationId: 'l-a02',
    lines: [{ poLineId: po4.lines[0].id, itemId: 'i-lap', receivedQty: 2, acceptedQty: 2, rejectedQty: 0, serialNos: ['LT-24005', 'LT-24006'] }],
  });

  createTransfer(db, sk, { mode: 'IN_TRANSIT', itemId: 'i-oil', lotId: 'lot-oil1', qty: 50, fromLocationId: 'l-a01', toLocationId: 'l-n01' });
  requestAdjustment(db, sk, { itemId: 'i-cbl', locationId: 'l-b01', qty: -25, reason: 'Drum damaged during handling (count variance)' });

  // Close periods older than last month.
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  for (const p of db.periods) if (p.month < prevKey) p.status = 'CLOSED';

  return db;
}
