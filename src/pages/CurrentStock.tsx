import { Card, Col, Descriptions, Empty, Input, Row, Select, Statistic, Table, Tag, Typography } from 'antd';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMemo, useState } from 'react';
import { svc } from '../domain/api';
import type { Balance } from '../domain/types';
import { fmtDate, fmtMoney, fmtQty, PageHeader, StatusTag, useLookups } from '../components/common';

export default function CurrentStock() {
  const { db, items, locations, lots } = useLookups();
  const [q, setQ] = useState('');
  const [wh, setWh] = useState<string | undefined>();
  const [selected, setSelected] = useState<string | undefined>('i-brg');

  const rows = useMemo(() => {
    const term = q.toLowerCase();
    return Object.values(db.balances)
      .filter((b) => b.onHand || b.reserved || b.blocked || b.inTransit)
      .filter((b) => !wh || locations.get(b.locationId)?.warehouseId === wh)
      .filter((b) => {
        const i = items.get(b.itemId)!;
        const l = locations.get(b.locationId)!;
        const lot = b.lotId ? lots.get(b.lotId) : undefined;
        return `${i.code} ${i.name} ${l.code} ${lot?.lotNo ?? ''}`.toLowerCase().includes(term);
      })
      .sort((a, b) => items.get(a.itemId)!.code.localeCompare(items.get(b.itemId)!.code) || a.locationId.localeCompare(b.locationId));
  }, [db, q, wh, items, locations, lots]);

  const tiles = useMemo(() => {
    const repl = svc.replenishment(db);
    return {
      onHand: db.items.filter((i) => svc.itemTotals(db, i.id).onHand > 0).length,
      below: repl.filter((r) => r.status !== 'OK').length,
      awaiting: db.purchaseOrders.filter((p) => ['SENT', 'PARTIALLY_RECEIVED'].includes(p.status)).length,
      nearExpiry: db.lots.filter((l) => svc.lotStatus(l) !== 'ACTIVE' && Object.values(db.balances).some((b) => b.lotId === l.id && b.onHand > 0)).length,
    };
  }, [db]);

  const item = selected ? items.get(selected) : undefined;
  const totals = selected ? svc.itemTotals(db, selected) : undefined;
  const breakdown = useMemo(() => {
    if (!selected) return [];
    const byLoc = new Map<string, { loc: string; 'On hand (available)': number; Reserved: number; Blocked: number; 'In transit': number }>();
    for (const b of Object.values(db.balances)) {
      if (b.itemId !== selected) continue;
      const code = locations.get(b.locationId)!.code;
      const r = byLoc.get(code) ?? { loc: code, 'On hand (available)': 0, Reserved: 0, Blocked: 0, 'In transit': 0 };
      r['On hand (available)'] += svc.available(b);
      r.Reserved += b.reserved;
      r.Blocked += b.blocked;
      r['In transit'] += b.inTransit;
      byLoc.set(code, r);
    }
    return [...byLoc.values()].filter((r) => r['On hand (available)'] || r.Reserved || r.Blocked || r['In transit']);
  }, [db, selected, locations]);

  return (
    <>
      <PageHeader title="Current Stock" subtitle="Balances by item, location and lot across the four ledger buckets. Available = on hand − reserved − blocked." />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card><Statistic title="Items on hand" value={tiles.onHand} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Below reorder point" value={tiles.below} valueStyle={{ color: tiles.below ? '#d4380d' : undefined }} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Awaiting receipts" value={tiles.awaiting} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Lots near expiry / expired" value={tiles.nearExpiry} valueStyle={{ color: tiles.nearExpiry ? '#d48806' : undefined }} /></Card></Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xxl={15}>
          <Card
            title="Stock by item & location"
            extra={
              <Row gutter={8} wrap={false}>
                <Col><Select allowClear placeholder="All warehouses" style={{ width: 160 }} value={wh} onChange={setWh} options={db.warehouses.map((w) => ({ value: w.id, label: w.name }))} /></Col>
                <Col><Input.Search placeholder="Item, location, lot" allowClear onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} /></Col>
              </Row>
            }
            styles={{ header: { flexWrap: 'wrap', gap: 8 } }}
          >
            <Table<Balance>
              size="small"
              rowKey="key"
              dataSource={rows}
              scroll={{ x: 760 }}
              pagination={{ pageSize: 12 }}
              onRow={(b) => ({ onClick: () => setSelected(b.itemId), style: { cursor: 'pointer' } })}
              rowClassName={(b) => (b.itemId === selected ? 'ant-table-row-selected' : '')}
              columns={[
                { title: 'Item', render: (_, b) => <><b>{items.get(b.itemId)?.code}</b><br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{items.get(b.itemId)?.name}</Typography.Text></> },
                { title: 'Location', render: (_, b) => locations.get(b.locationId)?.code },
                {
                  title: 'Lot', render: (_, b) => {
                    const lot = b.lotId ? lots.get(b.lotId) : undefined;
                    if (!lot) return '-';
                    const st = svc.lotStatus(lot);
                    return <>{lot.lotNo}{st !== 'ACTIVE' && <> <StatusTag status={st} /></>}</>;
                  },
                },
                { title: 'On hand', align: 'right', render: (_, b) => fmtQty(b.onHand) },
                { title: 'Reserved', align: 'right', render: (_, b) => (b.reserved ? <Tag color="blue">{fmtQty(b.reserved)}</Tag> : 0) },
                { title: 'Blocked', align: 'right', render: (_, b) => (b.blocked ? <Tag color="gold">{fmtQty(b.blocked)}</Tag> : 0) },
                { title: 'In transit', align: 'right', render: (_, b) => (b.inTransit ? <Tag color="orange">{fmtQty(b.inTransit)}</Tag> : 0) },
                { title: 'Available', align: 'right', render: (_, b) => <b>{fmtQty(svc.available(b))}</b> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xxl={9}>
          <Card title="Ledger buckets for selected item">
            <Select showSearch optionFilterProp="label" style={{ width: '100%', marginBottom: 16 }} value={selected} onChange={setSelected}
              options={db.items.map((i) => ({ value: i.id, label: `${i.code} - ${i.name}` }))} />
            {item && totals ? (
              <>
                <Descriptions size="small" column={2} bordered>
                  <Descriptions.Item label="On hand">{fmtQty(totals.onHand)} {item.uom}</Descriptions.Item>
                  <Descriptions.Item label="Available"><b>{fmtQty(totals.available)}</b></Descriptions.Item>
                  <Descriptions.Item label="Reserved">{fmtQty(totals.reserved)}</Descriptions.Item>
                  <Descriptions.Item label="Blocked">{fmtQty(totals.blocked)}</Descriptions.Item>
                  <Descriptions.Item label="In transit">{fmtQty(totals.inTransit)}</Descriptions.Item>
                  <Descriptions.Item label="Avg cost">{fmtMoney(item.avgCost)}</Descriptions.Item>
                  <Descriptions.Item label="Value" span={2}>{fmtMoney(totals.onHand * item.avgCost)}</Descriptions.Item>
                </Descriptions>
                <div style={{ width: '100%', height: Math.max(160, breakdown.length * 56 + 60), marginTop: 16 }}>
                  {breakdown.length ? (
                    <ResponsiveContainer>
                      <BarChart data={breakdown} layout="vertical" margin={{ left: 8, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} strokeOpacity={0.3} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="loc" width={80} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar isAnimationActive={false} dataKey="On hand (available)" stackId="a" fill="#1f6feb" />
                        <Bar isAnimationActive={false} dataKey="Reserved" stackId="a" fill="#7c3aed" />
                        <Bar isAnimationActive={false} dataKey="Blocked" stackId="a" fill="#d97706" />
                        <Bar isAnimationActive={false} dataKey="In transit" stackId="a" fill="#0d9488" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <Empty description="No stock" />}
                </div>
                {item.tracking === 'LOT' && (
                  <Table size="small" rowKey="id" pagination={false} style={{ marginTop: 8 }}
                    dataSource={db.lots.filter((l) => l.itemId === item.id)}
                    columns={[
                      { title: 'Lot', dataIndex: 'lotNo' },
                      { title: 'Expiry', render: (_, l) => fmtDate(l.expiry) },
                      { title: 'Status', render: (_, l) => <StatusTag status={svc.lotStatus(l)} /> },
                    ]} />
                )}
              </>
            ) : <Empty />}
          </Card>
        </Col>
      </Row>
    </>
  );
}
