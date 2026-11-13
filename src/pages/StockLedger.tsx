import { Button, Card, Col, Form, Input, Modal, Row, Select, Table, Tag, Tooltip, Typography } from 'antd';
import { RollbackOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { api } from '../domain/api';
import { TXN_TYPES, type StockTxn } from '../domain/types';
import { fmtDateTime, fmtMoney, fmtQty, PageHeader, TxnTag, usePerm, useLookups, useRunner } from '../components/common';

const NON_REVERSIBLE = ['REVERSAL', 'GRN_RECEIPT', 'TRANSFER_OUT', 'TRANSFER_IN', 'TRANSFER_DISPATCH', 'TRANSFER_RECEIVE'];

const Delta = ({ v }: { v: number }) =>
  v ? <span className="mono" style={{ color: v > 0 ? '#389e0d' : '#cf1322' }}>{v > 0 ? '+' : ''}{fmtQty(v)}</span> : <span style={{ opacity: 0.35 }}>·</span>;

export default function StockLedger() {
  const { db, items, locations, lots, users, serials } = useLookups();
  const canPost = usePerm('inventory.post');
  const run = useRunner();
  const [itemId, setItemId] = useState<string>();
  const [type, setType] = useState<string>();
  const [q, setQ] = useState('');
  const [reversing, setReversing] = useState<StockTxn | null>(null);
  const [form] = Form.useForm();

  const rows = useMemo(
    () =>
      [...db.txns]
        .filter((t) => (!itemId || t.itemId === itemId) && (!type || t.type === type))
        .filter((t) => !q || `${t.no} ${t.refNo ?? ''} ${t.remarks ?? ''}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.at.localeCompare(a.at) || b.no.localeCompare(a.no)),
    [db, itemId, type, q],
  );

  const reverse = async () => {
    const v = await form.validateFields();
    if (run(() => api.reverseTxn(reversing!.id, v.remarks), (r) => `${reversing!.no} reversed by ${r.no}`)) setReversing(null);
  };

  return (
    <>
      <PageHeader title="Stock Ledger" subtitle="Every posting, immutable. Corrections are made by reversal (once per transaction), never by editing." />
      <Card>
        <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
          <Col xs={24} md={8}><Select allowClear showSearch optionFilterProp="label" placeholder="All items" style={{ width: '100%' }} value={itemId} onChange={setItemId} options={db.items.map((i) => ({ value: i.id, label: `${i.code} - ${i.name}` }))} /></Col>
          <Col xs={12} md={6}><Select allowClear placeholder="All 16 transaction types" style={{ width: '100%' }} value={type} onChange={setType} options={TXN_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))} /></Col>
          <Col xs={12} md={10}><Input.Search placeholder="Txn no, reference or remarks" allowClear onChange={(e) => setQ(e.target.value)} /></Col>
        </Row>
        <Table
          size="small"
          rowKey="id"
          dataSource={rows}
          scroll={{ x: 1300 }}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          columns={[
            { title: 'Txn', dataIndex: 'no', render: (v, t) => <span className="mono" style={{ textDecoration: t.reversedById ? 'line-through' : undefined }}>{v}</span> },
            { title: 'Posted', render: (_, t) => <span className="mono">{fmtDateTime(t.at)}</span> },
            { title: 'Type', render: (_, t) => <TxnTag type={t.type} /> },
            { title: 'Item', render: (_, t) => <b>{items.get(t.itemId)?.code}</b> },
            { title: 'Location', render: (_, t) => locations.get(t.locationId)?.code },
            {
              title: 'Lot / serial', render: (_, t) => (t.lotId ? lots.get(t.lotId)?.lotNo : t.serialIds.length ? (
                <Tooltip title={t.serialIds.map((s) => serials.get(s)?.serialNo ?? '(removed)').join(', ')}><Tag>{t.serialIds.length} serial(s)</Tag></Tooltip>
              ) : '-'),
            },
            { title: 'On hand', align: 'right', render: (_, t) => <Delta v={t.deltas.onHand} /> },
            { title: 'Reserved', align: 'right', render: (_, t) => <Delta v={t.deltas.reserved} /> },
            { title: 'Blocked', align: 'right', render: (_, t) => <Delta v={t.deltas.blocked} /> },
            { title: 'In transit', align: 'right', render: (_, t) => <Delta v={t.deltas.inTransit} /> },
            { title: 'Unit cost', align: 'right', render: (_, t) => fmtMoney(t.unitCost) },
            { title: 'Reference', render: (_, t) => <>{t.refNo}{t.remarks && <><br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{t.remarks}</Typography.Text></>}</> },
            { title: 'By', render: (_, t) => users.get(t.userId)?.name },
            {
              title: '', width: 60, fixed: 'right',
              render: (_, t) => {
                const reason = !canPost ? 'Requires inventory.post'
                  : t.reversedById ? 'Already reversed (a transaction can be reversed only once)'
                  : NON_REVERSIBLE.includes(t.type) ? 'Correct this through its source document' : undefined;
                return (
                  <Tooltip title={reason ?? 'Reverse this transaction'}>
                    <Button size="small" icon={<RollbackOutlined />} disabled={!!reason} aria-label="Reverse"
                      onClick={() => { form.resetFields(); setReversing(t); }} />
                  </Tooltip>
                );
              },
            },
          ]}
        />
      </Card>
      <Modal title={`Reverse ${reversing?.no}`} open={!!reversing} onOk={reverse} onCancel={() => setReversing(null)} okText="Post reversal" okButtonProps={{ danger: true }} destroyOnHidden>
        <Typography.Paragraph>
          A reversal posts equal and opposite bucket movements. The original row stays in the ledger and is marked as reversed.
        </Typography.Paragraph>
        <Form form={form} layout="vertical">
          <Form.Item name="remarks" label="Reason" rules={[{ required: true, message: 'A reason is required' }]}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
