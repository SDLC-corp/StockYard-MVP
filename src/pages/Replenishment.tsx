import { Button, Card, Segmented, Table, Tooltip, Typography } from 'antd';
import { ShoppingCartOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { svc } from '../domain/api';
import type { ReplenishmentRow } from '../domain/services';
import { fmtQty, PageHeader, StatusTag, usePerm, useLookups } from '../components/common';

export default function Replenishment() {
  const { db } = useLookups();
  const canManage = usePerm('acquisition.manage');
  const navigate = useNavigate();
  const [view, setView] = useState<'Needs action' | 'All items'>('Needs action');
  const [selected, setSelected] = useState<string[]>([]);

  const rows = useMemo(() => {
    const all = svc.replenishment(db);
    const order = { CRITICAL: 0, REORDER: 1, OK: 2 };
    return all.filter((r) => view === 'All items' || r.status !== 'OK').sort((a, b) => order[a.status] - order[b.status]);
  }, [db, view]);

  const raisePO = () => {
    const prefill = rows.filter((r) => selected.includes(r.item.id) && r.suggestedQty > 0).map((r) => ({ itemId: r.item.id, qty: r.suggestedQty }));
    navigate('/acquisition/purchase-orders', { state: { prefill } });
  };

  return (
    <>
      <PageHeader
        title="Replenishment"
        subtitle="Projected stock = available + open PO quantity. Items at or below reorder point get a suggested order quantity."
        extra={
          <Tooltip title={canManage ? (selected.length ? undefined : 'Select items to order') : 'Requires acquisition.manage (Procurement role)'}>
            <Button type="primary" icon={<ShoppingCartOutlined />} disabled={!canManage || !selected.length} onClick={raisePO}>
              Draft PO for {selected.length || ''} selected
            </Button>
          </Tooltip>
        }
      />
      <Card>
        <Segmented options={['Needs action', 'All items']} value={view} onChange={(v) => setView(v as typeof view)} style={{ marginBottom: 12 }} />
        <Table<ReplenishmentRow>
          rowKey={(r) => r.item.id}
          dataSource={rows}
          scroll={{ x: 960 }}
          rowSelection={{ selectedRowKeys: selected, onChange: (k) => setSelected(k as string[]), getCheckboxProps: (r) => ({ disabled: r.suggestedQty <= 0 }) }}
          columns={[
            { title: 'Item', render: (_, r) => <><b>{r.item.code}</b><br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.item.name}</Typography.Text></> },
            { title: 'Available', align: 'right', render: (_, r) => fmtQty(r.available) },
            { title: 'On order', align: 'right', render: (_, r) => fmtQty(r.onOrder) },
            { title: 'Projected', align: 'right', render: (_, r) => <b>{fmtQty(r.projected)}</b> },
            { title: 'Safety stock', align: 'right', render: (_, r) => r.item.safetyStock },
            { title: 'Reorder point', align: 'right', render: (_, r) => r.item.reorderPoint },
            { title: 'Avg daily demand (30d)', align: 'right', render: (_, r) => fmtQty(r.avgDailyDemand) },
            { title: 'Days of cover', align: 'right', render: (_, r) => (r.daysOfCover === null ? '∞' : fmtQty(r.daysOfCover)) },
            { title: 'Suggested qty', align: 'right', render: (_, r) => (r.suggestedQty ? <b>{fmtQty(r.suggestedQty)} {r.item.uom}</b> : '-') },
            { title: 'Status', render: (_, r) => <StatusTag status={r.status} /> },
          ]}
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          Suggested quantity = max(reorder quantity, reorder point + safety stock − projected). CRITICAL means available stock is at or below safety stock.
        </Typography.Paragraph>
      </Card>
    </>
  );
}
