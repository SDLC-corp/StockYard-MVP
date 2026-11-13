// Shared domain contracts: enums, entities and request shapes.

export type Role = 'STOREKEEPER' | 'PROCUREMENT' | 'APPROVER' | 'ADMIN';
export type Permission = 'inventory.post' | 'acquisition.manage' | 'approval.act' | 'admin.manage';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  STOREKEEPER: ['inventory.post'],
  PROCUREMENT: ['acquisition.manage'],
  APPROVER: ['approval.act'],
  ADMIN: ['admin.manage'],
};

export const ROLE_LABEL: Record<Role, string> = {
  STOREKEEPER: 'Storekeeper',
  PROCUREMENT: 'Procurement',
  APPROVER: 'Approver',
  ADMIN: 'Administrator',
};

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  departmentId: string;
}

export type TrackingType = 'NONE' | 'LOT' | 'SERIAL';

export interface Item {
  id: string;
  code: string;
  name: string;
  group: string;
  uom: string;
  tracking: TrackingType;
  safetyStock: number;
  reorderPoint: number;
  reorderQty: number;
  avgCost: number;
  active: boolean;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  email: string;
  leadTimeDays: number;
}

export interface Department {
  id: string;
  code: string;
  name: string;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
}

export interface Location {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
}

export type LotStatus = 'ACTIVE' | 'NEAR_EXPIRY' | 'EXPIRED';

export interface Lot {
  id: string;
  itemId: string;
  lotNo: string;
  expiry?: string; // ISO date
  supplierBatch?: string;
  createdAt: string;
}

export type SerialStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'ISSUED'
  | 'IN_TRANSIT'
  | 'UNDER_MAINTENANCE'
  | 'DAMAGED'
  | 'SCRAPPED';

export interface SerialMovement {
  at: string;
  txnId: string;
  txnNo: string;
  type: TxnType;
  fromStatus: SerialStatus | null;
  toStatus: SerialStatus;
  fromLocationId: string | null;
  toLocationId: string | null;
  note?: string;
}

export interface Serial {
  id: string;
  itemId: string;
  serialNo: string;
  status: SerialStatus;
  locationId: string | null;
  history: SerialMovement[];
  serviceRecords: { at: string; note: string; userId: string }[];
}

/** The 16 stock transaction types. */
export const TXN_TYPES = [
  'OPENING',
  'GRN_RECEIPT',
  'ISSUE',
  'RETURN',
  'RESERVE',
  'UNRESERVE',
  'BLOCK',
  'UNBLOCK',
  'ADJUST_IN',
  'ADJUST_OUT',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'TRANSFER_DISPATCH',
  'TRANSFER_RECEIVE',
  'SCRAP',
  'REVERSAL',
] as const;
export type TxnType = (typeof TXN_TYPES)[number];

export interface Buckets {
  onHand: number;
  reserved: number;
  blocked: number;
  inTransit: number;
}

export interface Balance extends Buckets {
  key: string; // itemId|locationId|lotId
  itemId: string;
  locationId: string;
  lotId: string | null;
}

export interface StockTxn {
  id: string;
  no: string;
  type: TxnType;
  at: string;
  userId: string;
  itemId: string;
  locationId: string;
  lotId: string | null;
  serialIds: string[];
  qty: number;
  unitCost: number;
  deltas: Buckets;
  refType?: string;
  refNo?: string;
  remarks?: string;
  idempotencyKey?: string;
  reversalOfId?: string;
  reversedById?: string;
}

export type POStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'SENT'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export interface POLine {
  id: string;
  itemId: string;
  qty: number;
  unitPrice: number;
  receivedQty: number;
  rejectedQty: number;
}

export interface PurchaseOrder {
  id: string;
  no: string;
  supplierId: string;
  warehouseId: string;
  status: POStatus;
  expectedDate: string;
  createdAt: string;
  createdBy: string;
  remarks?: string;
  lines: POLine[];
}

export interface GateEntry {
  id: string;
  no: string;
  poId: string;
  vehicleNo: string;
  driver: string;
  at: string;
  userId: string;
  status: 'OPEN' | 'RECEIVED';
}

export interface GRNLine {
  poLineId: string;
  itemId: string;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  rejectReason?: string;
  lotNo?: string;
  expiry?: string;
  serialNos?: string[];
}

export interface GoodsReceipt {
  id: string;
  no: string;
  poId: string;
  gateEntryId: string;
  locationId: string;
  at: string;
  userId: string;
  lines: GRNLine[];
  txnIds: string[];
}

export interface Transfer {
  id: string;
  no: string;
  mode: 'DIRECT' | 'IN_TRANSIT';
  itemId: string;
  lotId: string | null;
  serialIds: string[];
  qty: number;
  fromLocationId: string;
  toLocationId: string;
  status: 'DISPATCHED' | 'RECEIVED';
  dispatchedAt: string;
  receivedAt?: string;
  userId: string;
  txnIds: string[];
}

export interface Adjustment {
  id: string;
  no: string;
  itemId: string;
  locationId: string;
  lotId: string | null;
  qty: number; // signed
  unitCost: number;
  reason: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  createdBy: string;
  txnId?: string;
}

export type ApprovalDocType = 'PURCHASE_ORDER' | 'ADJUSTMENT';

export interface ApprovalAction {
  at: string;
  userId: string;
  action: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  remarks?: string;
}

export interface ApprovalRequest {
  id: string;
  docType: ApprovalDocType;
  docId: string;
  docNo: string;
  summary: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: string;
  requestedAt: string;
  history: ApprovalAction[];
}

export interface AuditEntry {
  id: string;
  at: string;
  userId: string;
  entity: string;
  entityId: string;
  action: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}

export interface Period {
  month: string; // YYYY-MM
  status: 'OPEN' | 'CLOSED';
}

export interface DB {
  version: number;
  seq: Record<string, number>;
  users: User[];
  departments: Department[];
  items: Item[];
  suppliers: Supplier[];
  warehouses: Warehouse[];
  locations: Location[];
  lots: Lot[];
  serials: Serial[];
  balances: Record<string, Balance>;
  txns: StockTxn[];
  idempotency: Record<string, string>;
  purchaseOrders: PurchaseOrder[];
  gateEntries: GateEntry[];
  goodsReceipts: GoodsReceipt[];
  transfers: Transfer[];
  adjustments: Adjustment[];
  approvals: ApprovalRequest[];
  audit: AuditEntry[];
  periods: Period[];
}

export class DomainError extends Error {
  constructor(message: string, public code = 'DOMAIN_ERROR') {
    super(message);
    this.name = 'DomainError';
  }
}
