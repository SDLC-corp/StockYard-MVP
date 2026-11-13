import { Alert, Button, Card, Col, Descriptions, Form, Input, InputNumber, Radio, Row, Select, Table, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { api, svc } from '../domain/api';
import type { SerialStatus } from '../domain/types';
import { fmtDateTime, fmtQty, idemKey, ItemSelect, LocationSelect, LotSelect, PageHeader, SerialSelect, StatusTag, TxnTag, usePerm, useLookups, useRunner } from '../components/common';

type Op = 'ISSUE' | 'RETURN' | 'RESERVE' | 'UNRESERVE' | 'BLOCK' | 'UNBLOCK' | 'SCRAP' | 'ADJUST';

const OPS: { value: Op; label: string; help: string; serial: SerialStatus[]; outbound: boolean }[] = [
  { value: 'ISSUE', label: 'Issue', help: 'Issue material to a department or work order. Reduces on hand.', serial: ['AVAILABLE'], outbound: true },
  { value: 'RETURN', label: 'Return', help: 'Return previously issued material to stock.', serial: ['ISSUED'], outbound: false },
  { value: 'RESERVE', label: 'Reserve', help: 'Hold available stock for a work order. Moves quantity into RESERVED.', serial: ['AVAILABLE'], outbound: true },
  { value: 'UNRESERVE', label: 'Release', help: 'Release a reservation back to available.', serial: ['RESERVED'], outbound: true },
  { value: 'BLOCK', label: 'Block', help: 'Block stock for quality hold, damage or maintenance. Moves quantity into BLOCKED.', serial: ['AVAILABLE'], outbound: true },
  { value: 'UNBLOCK', label: 'Unblock', help: 'Release blocked stock back to available.', serial: ['UNDER_MAINTENANCE', 'DAMAGED'], outbound: true },
  { value: 'SCRAP', label: 'Scrap', help: 'Write off unusable stock from on hand.', serial: ['AVAILABLE'], outbound: true },
  { value: 'ADJUST', label: 'Adjustment', help: 'Count correction. Goes to the approval queue and posts only once approved.', serial: [], outbound: false },
];

export default function StockOperations() {
  const { db, items, locations, users } = useLookups();
  const canPost = usePerm('inventory.post');
  const run = useRunner();
  const [op, setOp] = useState<Op>('ISSUE');
  const [form] = Form.useForm();
  const [idem, setIdem] = useState(idemKey());
  const meta = OPS.find((o) => o.value === op)!;

  const itemId: string | undefined = Form.useWatch('itemId', form);
  const locationId: string | undefined = Form.useWatch('locationId', form);
  const lotId: string | undefined = Form.useWatch('lotId', form);
  const serialIds: string[] | undefined = Form.useWatch('serialIds', form);
  const item = itemId ? items.get(itemId) : undefined;

  useEffect(() => { form.resetFields(); setIdem(idemKey()); }, [op, form]);
  useEffect(() => { form.setFieldsValue({ locationId: undefined, lotId: undefined, serialIds: [] }); }, [itemId, form]);
  useEffect(() => { if (item?.tracking === 'SERIAL') form.setFieldValue('qty', serialIds?.length || undefined); }, [serialIds, item, form]);

  const bal = itemId && locationId ? db.balances[svc.balanceKey(itemId, locationId, item?.tracking === 'LOT' ? lotId ?? null : null)] : undefined;

  const submit = async () => {
    const v = await form.validateFields();
    let ok;
    if (op === 'ADJUST') {
      ok = run(() => api.requestAdjustment({ ...v, qty: v.qty }), (a) => `${a.no} sent for approval`);
    } else {
      ok = run(() => api.stockOperation(op, { ...v, lotId: v.lotId ?? null, idempotencyKey: idem }), (t) => `${t.no} posted`);
    }
    if (ok) { form.resetFields(); setIdem(idemKey()); }
  };

  const recent = useMemo(
    () => [...db.txns].filter((t) => ['ISSUE', 'RETURN', 'RESERVE', 'UNRESERVE', 'BLOCK', 'UNBLOCK', 'SCRAP', 'ADJUST_IN', 'ADJUST_OUT'].includes(t.type))
      .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12),
    [db],
  );
  const adjustments = [...db.adjustments].reverse().slice(0, 6);

  return (
    <>
      <PageHeader title="Stock Issues & Operations" subtitle="Every operation goes through the single posting service, which validates period, tracking, lot expiry and availability" />
      {!canPost && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="You are viewing as a role without inventory.post. The form is shown, but the server-side check will refuse any posting. Switch to the Storekeeper role to post." />}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={11}>
          <Card>
            <Radio.Group optionType="button" buttonStyle="solid" options={OPS.map((o) => ({ value: o.value, label: o.label }))} value={op} onChange={(e) => setOp(e.target.value as Op)} style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', rowGap: 8 }} />
            <Typography.Paragraph type="secondary">{meta.help}</Typography.Paragraph>
            <Form form={form} layout="vertical" onFinish={submit}>
              <Form.Item name="itemId" label="Item" rules={[{ required: true, message: 'Select an item' }]}>
                <ItemSelect filter={op === 'ADJUST' ? (i) => i.tracking !== 'SERIAL' : undefined} />
              </Form.Item>
              <Form.Item name="locationId" label="Location" rules={[{ required: true, message: 'Select a location' }]}>
                <LocationSelect withStockOf={meta.outbound ? itemId : undefined} />
              </Form.Item>
              {item?.tracking === 'LOT' && (
                <Form.Item name="lotId" label="Lot" rules={[{ required: true, message: 'This item is lot-tracked' }]}>
                  <LotSelect itemId={itemId} locationId={locationId} />
                </Form.Item>
              )}
              {item?.tracking === 'SERIAL' && (
                <Form.Item name="serialIds" label="Serial numbers" rules={[{ required: true, message: 'Select the units' }]}>
                  <SerialSelect itemId={itemId} locationId={op === 'RETURN' ? undefined : locationId} statuses={meta.serial} />
                </Form.Item>
              )}
              {op === 'BLOCK' && item?.tracking === 'SERIAL' && (
                <Form.Item name="serialBlockStatus" label="Unit state" initialValue="UNDER_MAINTENANCE">
                  <Select options={[{ value: 'UNDER_MAINTENANCE', label: 'Under maintenance' }, { value: 'DAMAGED', label: 'Damaged' }]} />
                </Form.Item>
              )}
              {bal && (
                <Descriptions size="small" bordered column={4} style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="On hand">{fmtQty(bal.onHand)}</Descriptions.Item>
                  <Descriptions.Item label="Reserved">{fmtQty(bal.reserved)}</Descriptions.Item>
                  <Descriptions.Item label="Blocked">{fmtQty(bal.blocked)}</Descriptions.Item>
                  <Descriptions.Item label="Available"><b>{fmtQty(svc.available(bal))}</b></Descriptions.Item>
                </Descriptions>
              )}
              <Row gutter={12}>
                <Col span={op === 'ADJUST' ? 12 : 24}>
                  <Form.Item name="qty" label={op === 'ADJUST' ? 'Quantity change (+ / −)' : `Quantity${item ? ` (${item.uom})` : ''}`} rules={[{ required: true, message: 'Enter a quantity' }]}
                    extra={item?.tracking === 'SERIAL' ? 'Set from the number of serials selected' : undefined}>
                    <InputNumber style={{ width: '100%' }} min={op === 'ADJUST' ? undefined : 0.001} disabled={item?.tracking === 'SERIAL'} />
                  </Form.Item>
                </Col>
                {op === 'ADJUST' && (
                  <Col span={12}><Form.Item name="unitCost" label="Unit cost (optional)" extra="Defaults to average cost"><InputNumber min={0} prefix="$" style={{ width: '100%' }} /></Form.Item></Col>
                )}
              </Row>
              {(op === 'ISSUE' || op === 'RETURN') && (
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item name="departmentId" label="Department" rules={[{ required: true, message: 'Select a department' }]}>
                      <Select showSearch optionFilterProp="label" options={db.departments.map((d) => ({ value: d.id, label: `${d.code} - ${d.name}` }))} />
                    </Form.Item>
                  </Col>
                  <Col span={12}><Form.Item name="workOrder" label="Work order (optional)"><Input placeholder="e.g. 5650" /></Form.Item></Col>
                </Row>
              )}
              <Form.Item name={op === 'ADJUST' ? 'reason' : 'remarks'} label={op === 'ADJUST' ? 'Reason' : 'Remarks'} rules={op === 'ADJUST' ? [{ required: true, message: 'A reason is required' }] : []}>
                <Input.TextArea rows={2} />
              </Form.Item>
              <Button type="primary" htmlType="submit" block size="large">
                {op === 'ADJUST' ? 'Submit adjustment for approval' : `Post ${meta.label.toLowerCase()}`}
              </Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={13}>
          <Card title="Recent operations" style={{ marginBottom: 16 }}>
            <Table size="small" rowKey="id" className="nowrap-table" dataSource={recent} pagination={false} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Txn', dataIndex: 'no', render: (v) => <span className="mono">{v}</span> },
                { title: 'When', render: (_, t) => fmtDateTime(t.at) },
                { title: 'Type', render: (_, t) => <TxnTag type={t.type} /> },
                { title: 'Item', render: (_, t) => items.get(t.itemId)?.code },
                { title: 'Loc', render: (_, t) => locations.get(t.locationId)?.code },
                { title: 'Qty', align: 'right', render: (_, t) => fmtQty(t.qty) },
                { title: 'Ref', dataIndex: 'refNo' },
              ]} />
          </Card>
          <Card title="Adjustment requests">
            <Table size="small" rowKey="id" dataSource={adjustments} pagination={false}
              columns={[
                { title: 'No', dataIndex: 'no' },
                { title: 'Item', render: (_, a) => items.get(a.itemId)?.code },
                { title: 'Qty', align: 'right', render: (_, a) => (a.qty > 0 ? `+${a.qty}` : a.qty) },
                { title: 'Reason', dataIndex: 'reason', ellipsis: true },
                { title: 'By', render: (_, a) => users.get(a.createdBy)?.name },
                { title: 'Status', render: (_, a) => <StatusTag status={a.status} /> },
              ]} />
          </Card>
        </Col>
      </Row>
    </>
  );
}
