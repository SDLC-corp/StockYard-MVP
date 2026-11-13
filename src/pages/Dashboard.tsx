import { Card, Col, Empty, List, Row, Statistic, Table, Typography } from 'antd';
import { AlertOutlined, ClockCircleOutlined, DatabaseOutlined, InboxOutlined, WarningOutlined } from '@ant-design/icons';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { svc, useSessionUser } from '../domain/api';
import { ROLE_LABEL } from '../domain/types';
import { fmtDateTime, fmtMoney, fmtQty, PageHeader, StatusTag, TxnTag, useLookups } from '../components/common';

export default function Dashboard() {
  const { db, items, locations } = useLookups();
  const user = useSessionUser()!;

  const k = useMemo(() => {
    const totals = db.items.map((i) => ({ item: i, t: svc.itemTotals(db, i.id) }));
    const value = totals.reduce((s, x) => s + x.t.onHand * x.item.avgCost, 0);
    const below = svc.replenishment(db).filter((r) => r.status !== 'OK');
    const awaiting = db.purchaseOrders.filter((p) => ['SENT', 'PARTIALLY_RECEIVED'].includes(p.status));
    const nearExpiry = db.lots.filter((l) => {
      const st = svc.lotStatus(l);
      return st !== 'ACTIVE' && Object.values(db.balances).some((b) => b.lotId === l.id && b.onHand > 0);
    });

    // Movement statistics, last 14 days
    const days: { day: string; Inbound: number; Outbound: number }[] = [];
    for (let i = 13; i >= 0; i--) days.push({ day: dayjs().subtract(i, 'day').format('DD MMM'), Inbound: 0, Outbound: 0 });
    const start = dayjs().subtract(13, 'day').startOf('day');
    for (const t of db.txns) {
      const d = dayjs(t.at);
      if (d.isBefore(start)) continue;
      const row = days[d.startOf('day').diff(start, 'day')];
      if (!row) continue;
      const val = Math.abs(t.deltas.onHand) * t.unitCost;
      if (['GRN_RECEIPT', 'RETURN', 'ADJUST_IN'].includes(t.type)) row.Inbound += Math.round(val);
      if (['ISSUE', 'ADJUST_OUT', 'SCRAP'].includes(t.type)) row.Outbound += Math.round(val);
    }
    return { value, below, awaiting, nearExpiry, days, onHandItems: totals.filter((x) => x.t.onHand > 0).length };
  }, [db]);

  const pending = db.approvals.filter((a) => a.status === 'PENDING');
  const recent = [...db.txns].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

  return (
    <>
      <PageHeader title={`Good day, ${user.name.split(' ')[0]}`} subtitle={`Signed in as ${ROLE_LABEL[user.role]}. Here is the state of the stock ledger.`} />
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card><Statistic title="Items on hand" value={k.onHandItems} prefix={<DatabaseOutlined />} suffix={`/ ${db.items.length}`} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Link to="/planning/replenishment">
            <Card hoverable><Statistic title="Below reorder point" value={k.below.length} valueStyle={{ color: k.below.length ? '#d4380d' : undefined }} prefix={<WarningOutlined />} /></Card>
          </Link>
        </Col>
        <Col xs={12} md={6}>
          <Link to="/receiving/goods-receipts">
            <Card hoverable><Statistic title="Awaiting receipt (POs)" value={k.awaiting.length} prefix={<InboxOutlined />} /></Card>
          </Link>
        </Col>
        <Col xs={12} md={6}>
          <Link to="/traceability/serials">
            <Card hoverable><Statistic title="Lots near expiry / expired" value={k.nearExpiry.length} valueStyle={{ color: k.nearExpiry.length ? '#d48806' : undefined }} prefix={<ClockCircleOutlined />} /></Card>
          </Link>
        </Col>

        <Col xs={24} lg={16}>
          <Card title="Movement statistics · value, last 14 days" extra={<Typography.Text type="secondary">Stock value {fmtMoney(k.value)}</Typography.Text>}>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={k.days} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis tick={{ fontSize: 11 }} width={56} />
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                  <Legend />
                  <Bar isAnimationActive={false} dataKey="Inbound" fill="#1f6feb" radius={[4, 4, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="Outbound" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={<><AlertOutlined /> Pending approvals</>} extra={<Link to="/approvals">Open queue</Link>} style={{ height: '100%' }}>
            {pending.length ? (
              <List
                size="small"
                dataSource={pending}
                renderItem={(a) => (
                  <List.Item extra={fmtMoney(a.amount)}>
                    <List.Item.Meta title={a.docNo} description={a.summary} />
                  </List.Item>
                )}
              />
            ) : <Empty description="Nothing waiting" />}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Replenishment alerts" extra={<Link to="/planning/replenishment">Plan</Link>}>
            <Table
              size="small"
              rowKey={(r) => r.item.id}
              pagination={false}
              dataSource={k.below}
              locale={{ emptyText: 'All items above reorder point' }}
              columns={[
                { title: 'Item', render: (_, r) => <><b>{r.item.code}</b><br /><Typography.Text type="secondary">{r.item.name}</Typography.Text></> },
                { title: 'Available', align: 'right', render: (_, r) => fmtQty(r.available) },
                { title: 'ROP', align: 'right', render: (_, r) => r.item.reorderPoint },
                { title: 'Status', render: (_, r) => <StatusTag status={r.status} /> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Latest ledger postings" extra={<Link to="/inventory/stock-ledger">Ledger</Link>}>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={recent}
              scroll={{ x: 480 }}
              columns={[
                { title: 'When', render: (_, t) => <span className="mono">{fmtDateTime(t.at)}</span> },
                { title: 'Type', render: (_, t) => <TxnTag type={t.type} /> },
                { title: 'Item', render: (_, t) => items.get(t.itemId)?.code },
                { title: 'Loc', render: (_, t) => locations.get(t.locationId)?.code },
                { title: 'Qty', align: 'right', render: (_, t) => fmtQty(t.qty) },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}
