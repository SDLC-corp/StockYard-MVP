import { App as AntApp, Select, Space, Tag, Tooltip, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import dayjs from 'dayjs';
import { svc, useDb, useSessionUser } from '../domain/api';
import type { DB, Permission, SerialStatus } from '../domain/types';

export const fmtQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });
export const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDate = (s?: string) => (s ? dayjs(s).format('DD MMM YYYY') : '-');
export const fmtDateTime = (s?: string) => (s ? dayjs(s).format('DD MMM YYYY HH:mm') : '-');

export function useLookups() {
  const db = useDb();
  return useMemo(() => {
    const byId = <T extends { id: string }>(arr: T[]) => new Map(arr.map((x) => [x.id, x]));
    return {
      db,
      items: byId(db.items),
      locations: byId(db.locations),
      warehouses: byId(db.warehouses),
      suppliers: byId(db.suppliers),
      users: byId(db.users),
      lots: byId(db.lots),
      serials: byId(db.serials),
      departments: byId(db.departments),
    };
  }, [db]);
}

/** Run a domain action and surface DomainError messages verbatim. */
export function useRunner() {
  const { message } = AntApp.useApp();
  return function run<T>(fn: () => T, success?: string | ((r: T) => string)): T | undefined {
    try {
      const r = fn();
      if (success) message.success(typeof success === 'function' ? success(r) : success);
      return r;
    } catch (e) {
      message.error({ content: (e as Error).message, duration: 6 });
      return undefined;
    }
  };
}

export function usePerm(perm: Permission) {
  const user = useSessionUser();
  return !!user && svc.hasPerm(user, perm);
}

/** Explain in plain language why an action is unavailable. */
export function PermGate({ perm, children }: { perm: Permission; children: (allowed: boolean, reason?: string) => ReactNode }) {
  const allowed = usePerm(perm);
  return <>{children(allowed, allowed ? undefined : `Requires the "${perm}" permission`)}</>;
}

export function PageHeader({ title, subtitle, extra }: { title: string; subtitle?: string; extra?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>{title}</Typography.Title>
        {subtitle && <Typography.Text type="secondary">{subtitle}</Typography.Text>}
      </div>
      {extra && <Space wrap>{extra}</Space>}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default', PENDING_APPROVAL: 'gold', PENDING: 'gold', APPROVED: 'blue', SENT: 'geekblue',
  PARTIALLY_RECEIVED: 'cyan', RECEIVED: 'green', REJECTED: 'red', CANCELLED: 'default', OPEN: 'green', CLOSED: 'default',
  DISPATCHED: 'orange', ACTIVE: 'green', NEAR_EXPIRY: 'orange', EXPIRED: 'red',
  AVAILABLE: 'green', RESERVED: 'blue', ISSUED: 'purple', IN_TRANSIT: 'orange', UNDER_MAINTENANCE: 'gold',
  DAMAGED: 'volcano', SCRAPPED: 'default', OK: 'green', REORDER: 'orange', CRITICAL: 'red',
};

export function StatusTag({ status }: { status: string }) {
  return <Tag color={STATUS_COLORS[status] ?? 'default'}>{status.replace(/_/g, ' ')}</Tag>;
}

const TXN_COLORS: Record<string, string> = {
  OPENING: 'default', GRN_RECEIPT: 'green', ISSUE: 'purple', RETURN: 'cyan', RESERVE: 'blue', UNRESERVE: 'blue',
  BLOCK: 'gold', UNBLOCK: 'gold', ADJUST_IN: 'lime', ADJUST_OUT: 'volcano', TRANSFER_OUT: 'orange',
  TRANSFER_IN: 'orange', TRANSFER_DISPATCH: 'orange', TRANSFER_RECEIVE: 'orange', SCRAP: 'red', REVERSAL: 'magenta',
};
export const TxnTag = ({ type }: { type: string }) => <Tag color={TXN_COLORS[type]}>{type.replace(/_/g, ' ')}</Tag>;

/* ---------------- Searchable dependent selects ---------------- */

const filterOption = (input: string, option?: { label?: unknown }) =>
  String(option?.label ?? '').toLowerCase().includes(input.toLowerCase());

export function ItemSelect(props: { value?: string; onChange?: (v: string) => void; filter?: (i: DB['items'][number]) => boolean; disabled?: boolean }) {
  const db = useDb();
  return (
    <Select
      showSearch
      placeholder="Search item by code or name"
      value={props.value}
      onChange={props.onChange}
      disabled={props.disabled}
      filterOption={filterOption}
      options={db.items.filter((i) => i.active && (!props.filter || props.filter(i))).map((i) => ({
        value: i.id, label: `${i.code} - ${i.name}`,
      }))}
    />
  );
}

export function LocationSelect(props: { value?: string; onChange?: (v: string) => void; warehouseId?: string; exclude?: string; withStockOf?: string }) {
  const db = useDb();
  const locs = db.locations.filter((l) => {
    if (props.warehouseId && l.warehouseId !== props.warehouseId) return false;
    if (props.exclude && l.id === props.exclude) return false;
    if (props.withStockOf)
      return Object.values(db.balances).some((b) => b.itemId === props.withStockOf && b.locationId === l.id && b.onHand > 0);
    return true;
  });
  return (
    <Select
      showSearch
      placeholder={props.withStockOf && !locs.length ? 'No stock of this item anywhere' : 'Select location'}
      value={props.value}
      onChange={props.onChange}
      filterOption={filterOption}
      options={locs.map((l) => {
        const avail = props.withStockOf
          ? Object.values(db.balances).filter((b) => b.itemId === props.withStockOf && b.locationId === l.id).reduce((s, b) => s + svc.available(b), 0)
          : null;
        return { value: l.id, label: `${l.code} - ${l.name}${avail !== null ? `  (avail ${fmtQty(avail)})` : ''}` };
      })}
    />
  );
}

export function LotSelect(props: { value?: string; onChange?: (v: string) => void; itemId?: string; locationId?: string }) {
  const db = useDb();
  const lots = db.lots.filter((l) => l.itemId === props.itemId);
  return (
    <Select
      showSearch
      allowClear
      placeholder={props.itemId ? 'Select lot' : 'Select an item first'}
      disabled={!props.itemId}
      value={props.value}
      onChange={props.onChange}
      filterOption={filterOption}
      options={lots.map((l) => {
        const b = props.locationId ? db.balances[svc.balanceKey(l.itemId, props.locationId, l.id)] : undefined;
        const st = svc.lotStatus(l);
        return {
          value: l.id,
          label: `${l.lotNo}${l.expiry ? ` · exp ${fmtDate(l.expiry)}` : ''}${b ? ` · avail ${fmtQty(svc.available(b))}` : ''}${st !== 'ACTIVE' ? ` · ${st.replace('_', ' ')}` : ''}`,
        };
      })}
    />
  );
}

export function SerialSelect(props: {
  value?: string[]; onChange?: (v: string[]) => void; itemId?: string; locationId?: string; statuses: SerialStatus[];
}) {
  const db = useDb();
  const serials = db.serials.filter(
    (s) => s.itemId === props.itemId && props.statuses.includes(s.status) && (!props.locationId || s.locationId === props.locationId || s.locationId === null),
  );
  return (
    <Select
      mode="multiple"
      placeholder={serials.length ? 'Select serial numbers' : `No serials in state ${props.statuses.join('/')} here`}
      value={props.value}
      onChange={props.onChange}
      filterOption={filterOption}
      options={serials.map((s) => ({ value: s.id, label: `${s.serialNo} (${s.status.replace('_', ' ')})` }))}
    />
  );
}

export function Hint({ text, children }: { text?: string; children: ReactNode }) {
  return text ? <Tooltip title={text}>{children}</Tooltip> : <>{children}</>;
}

export const idemKey = () => `ui-${Date.now()}-${Math.random().toString(36).slice(2)}`;
