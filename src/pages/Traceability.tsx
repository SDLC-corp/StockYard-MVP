import { Button, Card, Descriptions, Drawer, Empty, Input, List, Select, Space, Table, Tabs, Timeline, Typography } from 'antd';
import { ToolOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { api, svc } from '../domain/api';
import type { SerialStatus } from '../domain/types';
import { fmtDate, fmtDateTime, fmtQty, PageHeader, StatusTag, TxnTag, usePerm, useLookups, useRunner } from '../components/common';

const SERIAL_STATES: SerialStatus[] = ['AVAILABLE', 'RESERVED', 'ISSUED', 'IN_TRANSIT', 'UNDER_MAINTENANCE', 'DAMAGED', 'SCRAPPED'];

export default function Traceability() {
  const { db, items, locations, users } = useLookups();
  const canPost = usePerm('inventory.post');
  const run = useRunner();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<SerialStatus>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const serial = openId ? db.serials.find((s) => s.id === openId) : undefined;

  const serials = useMemo(
    () => db.serials.filter((s) => (!status || s.status === status) && `${s.serialNo} ${items.get(s.itemId)?.code}`.toLowerCase().includes(q.toLowerCase())),
    [db, q, status, items],
  );

  const lotRows = useMemo(
    () => db.lots.map((l) => {
      const bs = Object.values(db.balances).filter((b) => b.lotId === l.id);
      return {
        ...l, status: svc.lotStatus(l),
        onHand: bs.reduce((s, b) => s + b.onHand, 0),
        blocked: bs.reduce((s, b) => s + b.blocked, 0),
        available: bs.reduce((s, b) => s + svc.available(b), 0),
        locs: [...new Set(bs.filter((b) => b.onHand || b.inTransit).map((b) => locations.get(b.locationId)?.code))].join(', '),
      };
    }).sort((a, b) => (a.expiry ?? '9999').localeCompare(b.expiry ?? '9999')),
    [db, locations],
  );

  return (
    <>
      <PageHeader title="Lots & Serials" subtitle="Lots carry expiry; serials carry one state at a time with movement history written at posting time" />
      <Tabs items={[
        {
          key: 'serials', label: `Serial numbers (${db.serials.length})`,
          children: (
            <Card>
              <Space wrap style={{ marginBottom: 12 }}>
                <Input.Search placeholder="Serial or item code" allowClear onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
                <Select allowClear placeholder="Any state" style={{ width: 200 }} value={status} onChange={setStatus} options={SERIAL_STATES.map((s) => ({ value: s, label: s.replace('_', ' ') }))} />
              </Space>
              <Table size="small" rowKey="id" dataSource={serials} scroll={{ x: 640 }}
                onRow={(s) => ({ onClick: () => setOpenId(s.id), style: { cursor: 'pointer' } })}
                columns={[
                  { title: 'Serial', dataIndex: 'serialNo', render: (v) => <b className="mono">{v}</b> },
                  { title: 'Item', render: (_, s) => `${items.get(s.itemId)?.code} - ${items.get(s.itemId)?.name}` },
                  { title: 'State', render: (_, s) => <StatusTag status={s.status} /> },
                  { title: 'Location', render: (_, s) => (s.locationId ? locations.get(s.locationId)?.code : '-') },
                  { title: 'Movements', align: 'right', render: (_, s) => s.history.length },
                  { title: 'Service records', align: 'right', render: (_, s) => s.serviceRecords.length || '-' },
                ]} />
            </Card>
          ),
        },
        {
          key: 'lots', label: `Lot registry (${db.lots.length})`,
          children: (
            <Card>
              <Table size="small" rowKey="id" dataSource={lotRows} scroll={{ x: 760 }}
                columns={[
                  { title: 'Lot', dataIndex: 'lotNo', render: (v) => <b className="mono">{v}</b> },
                  { title: 'Item', render: (_, l) => `${items.get(l.itemId)?.code} - ${items.get(l.itemId)?.name}` },
                  { title: 'Expiry', render: (_, l) => fmtDate(l.expiry) },
                  { title: 'Status', render: (_, l) => <StatusTag status={l.status} /> },
                  { title: 'On hand', align: 'right', render: (_, l) => fmtQty(l.onHand) },
                  { title: 'Blocked', align: 'right', render: (_, l) => fmtQty(l.blocked) },
                  { title: 'Available', align: 'right', render: (_, l) => <b>{fmtQty(l.available)}</b> },
                  { title: 'Locations', dataIndex: 'locs' },
                ]} />
              <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
                Lots within {svc.NEAR_EXPIRY_DAYS} days of expiry show as near expiry. Expired lots are refused by the posting service for
                issue, reserve and transfer. An administrator can run the expiry sweep to move their remaining stock into BLOCKED.
              </Typography.Paragraph>
            </Card>
          ),
        },
      ]} />

      <Drawer title={serial ? `Serial ${serial.serialNo}` : ''} open={!!serial} onClose={() => setOpenId(null)} width={Math.min(520, window.innerWidth)}>
        {serial && (
          <>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="Item">{items.get(serial.itemId)?.code} - {items.get(serial.itemId)?.name}</Descriptions.Item>
              <Descriptions.Item label="State"><StatusTag status={serial.status} /></Descriptions.Item>
              <Descriptions.Item label="Location">{serial.locationId ? locations.get(serial.locationId)?.name : 'Not in a store'}</Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5} style={{ marginTop: 20 }}>Movement history</Typography.Title>
            <Timeline items={serial.history.map((h) => ({
              children: (
                <>
                  <TxnTag type={h.type} /> <span className="mono">{h.txnNo}</span><br />
                  {h.fromStatus ?? 'NEW'} → <b>{h.toStatus}</b>
                  {(h.fromLocationId || h.toLocationId) && <> · {h.fromLocationId ? locations.get(h.fromLocationId)?.code : '-'} → {h.toLocationId ? locations.get(h.toLocationId)?.code : '-'}</>}
                  <br /><Typography.Text type="secondary">{fmtDateTime(h.at)}{h.note ? ` · ${h.note}` : ''}</Typography.Text>
                </>
              ),
            }))} />
            <Typography.Title level={5}><ToolOutlined /> Maintenance & service records</Typography.Title>
            {serial.serviceRecords.length ? (
              <List size="small" dataSource={serial.serviceRecords} renderItem={(r) => (
                <List.Item><List.Item.Meta title={r.note} description={`${fmtDateTime(r.at)} · ${users.get(r.userId)?.name}`} /></List.Item>
              )} />
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No service records" />}
            <Space.Compact style={{ width: '100%', marginTop: 12 }}>
              <Input placeholder={canPost ? 'Add a service note' : 'Requires inventory.post'} disabled={!canPost} value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="primary" disabled={!canPost || !note.trim()} onClick={() => { if (run(() => { api.addServiceRecord(serial.id, note); return true; }, 'Service record added')) setNote(''); }}>Add</Button>
            </Space.Compact>
          </>
        )}
      </Drawer>
    </>
  );
}
