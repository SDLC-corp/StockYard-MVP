import { Alert, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import { CarOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { api } from '../domain/api';
import type { GateEntry, GRNLine, PurchaseOrder } from '../domain/types';
import { fmtDate, fmtDateTime, fmtQty, idemKey, LocationSelect, PageHeader, StatusTag, usePerm, useLookups, useRunner } from '../components/common';

interface LineForm {
  poLineId: string; itemId: string; outstanding: number;
  receivedQty: number; acceptedQty: number; rejectedQty: number; rejectReason?: string;
  lotNo?: string; expiry?: { format: (f: string) => string }; serialNos?: string[];
}

export default function Receiving() {
  const { db, items, suppliers, users, locations } = useLookups();
  const canPost = usePerm('inventory.post');
  const run = useRunner();
  const [gatePo, setGatePo] = useState<PurchaseOrder | null>(null);
  const [grnGate, setGrnGate] = useState<GateEntry | null>(null);
  const [gForm] = Form.useForm();
  const [rForm] = Form.useForm();
  const [idem, setIdem] = useState(idemKey());
  const locked = canPost ? undefined : 'Requires inventory.post (Storekeeper role)';

  const awaiting = db.purchaseOrders.filter((p) => ['SENT', 'PARTIALLY_RECEIVED'].includes(p.status));
  const openGates = db.gateEntries.filter((g) => g.status === 'OPEN');
  const poOf = (id: string) => db.purchaseOrders.find((p) => p.id === id)!;

  const startGrn = (g: GateEntry) => {
    const po = poOf(g.poId);
    rForm.resetFields();
    rForm.setFieldsValue({
      locationId: undefined,
      lines: po.lines.filter((l) => l.qty > l.receivedQty).map<Partial<LineForm>>((l) => {
        const out = l.qty - l.receivedQty;
        return { poLineId: l.id, itemId: l.itemId, outstanding: out, receivedQty: out, acceptedQty: out, rejectedQty: 0, serialNos: [] };
      }),
    });
    setIdem(idemKey());
    setGrnGate(g);
  };

  const logGate = async () => {
    const v = await gForm.validateFields();
    if (run(() => api.createGateEntry({ poId: gatePo!.id, ...v }), (g) => `${g.no} logged at the gate`)) setGatePo(null);
  };

  const postGrn = async () => {
    const v = await rForm.validateFields();
    const lines: GRNLine[] = (v.lines as LineForm[]).map((l) => ({
      poLineId: l.poLineId, itemId: l.itemId, receivedQty: l.receivedQty ?? 0, acceptedQty: l.acceptedQty ?? 0, rejectedQty: l.rejectedQty ?? 0,
      rejectReason: l.rejectReason, lotNo: l.lotNo, expiry: l.expiry ? l.expiry.format('YYYY-MM-DD') : undefined, serialNos: l.serialNos,
    }));
    const grn = run(() => api.postGoodsReceipt({ gateEntryId: grnGate!.id, locationId: v.locationId, lines, idempotencyKey: idem }), (g) => `${g.no} posted to stock`);
    if (grn) setGrnGate(null);
  };

  return (
    <>
      <PageHeader title="Goods Receipts" subtitle="Deliveries are logged at the gate, inspected, and only accepted quantity is posted to stock" />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card title="1 · Purchase orders awaiting delivery">
            <Table size="small" rowKey="id" dataSource={awaiting} pagination={false} locale={{ emptyText: 'No sent POs awaiting delivery' }}
              columns={[
                { title: 'PO', dataIndex: 'no', render: (v) => <b>{v}</b> },
                { title: 'Supplier', render: (_, p) => suppliers.get(p.supplierId)?.name },
                { title: 'Expected', render: (_, p) => fmtDate(p.expectedDate) },
                { title: 'Status', render: (_, p) => <StatusTag status={p.status} /> },
                {
                  title: '', render: (_, p) => (
                    <Tooltip title={locked}>
                      <Button size="small" icon={<CarOutlined />} disabled={!canPost} onClick={() => { gForm.resetFields(); setGatePo(p); }}>Gate entry</Button>
                    </Tooltip>
                  ),
                },
              ]} />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="2 · At the gate, awaiting inspection">
            <Table size="small" rowKey="id" dataSource={openGates} pagination={false} locale={{ emptyText: 'No vehicles waiting' }}
              columns={[
                { title: 'Gate entry', dataIndex: 'no', render: (v) => <b>{v}</b> },
                { title: 'PO', render: (_, g) => poOf(g.poId).no },
                { title: 'Vehicle', dataIndex: 'vehicleNo' },
                { title: 'Arrived', render: (_, g) => fmtDateTime(g.at) },
                {
                  title: '', render: (_, g) => (
                    <Tooltip title={locked}>
                      <Button size="small" type="primary" icon={<CheckCircleOutlined />} disabled={!canPost} onClick={() => startGrn(g)}>Inspect & receive</Button>
                    </Tooltip>
                  ),
                },
              ]} />
          </Card>
        </Col>
        <Col span={24}>
          <Tabs items={[{
            key: 'grn', label: 'Posted goods receipts',
            children: (
              <Table rowKey="id" dataSource={[...db.goodsReceipts].reverse()} scroll={{ x: 800 }}
                expandable={{
                  expandedRowRender: (g) => (
                    <Table size="small" rowKey="poLineId" pagination={false} dataSource={g.lines}
                      columns={[
                        { title: 'Item', render: (_, l) => items.get(l.itemId)?.code },
                        { title: 'Received', align: 'right', render: (_, l) => fmtQty(l.receivedQty) },
                        { title: 'Accepted', align: 'right', render: (_, l) => fmtQty(l.acceptedQty) },
                        { title: 'Rejected', align: 'right', render: (_, l) => (l.rejectedQty ? <Typography.Text type="danger">{fmtQty(l.rejectedQty)} · {l.rejectReason}</Typography.Text> : 0) },
                        { title: 'Lot / serials', render: (_, l) => l.lotNo ? <Tag>{l.lotNo}{l.expiry ? ` exp ${fmtDate(l.expiry)}` : ''}</Tag> : l.serialNos?.map((s) => <Tag key={s}>{s}</Tag>) },
                      ]} />
                  ),
                }}
                columns={[
                  { title: 'GRN', dataIndex: 'no', render: (v) => <b>{v}</b> },
                  { title: 'PO', render: (_, g) => poOf(g.poId).no },
                  { title: 'Gate entry', render: (_, g) => db.gateEntries.find((x) => x.id === g.gateEntryId)?.no },
                  { title: 'Location', render: (_, g) => locations.get(g.locationId)?.code },
                  { title: 'Posted', render: (_, g) => fmtDateTime(g.at) },
                  { title: 'By', render: (_, g) => users.get(g.userId)?.name },
                ]} />
            ),
          }]} />
        </Col>
      </Row>

      <Modal title={`Gate entry for ${gatePo?.no}`} open={!!gatePo} onOk={logGate} onCancel={() => setGatePo(null)} okText="Log arrival" destroyOnHidden>
        <Form form={gForm} layout="vertical">
          <Form.Item name="vehicleNo" label="Vehicle number" rules={[{ required: true }]}><Input placeholder="e.g. KA01 AB 1234" /></Form.Item>
          <Form.Item name="driver" label="Driver / carrier"><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal title={grnGate ? `Inspect & receive · ${grnGate.no} / ${poOf(grnGate.poId).no}` : ''} open={!!grnGate} onOk={postGrn} onCancel={() => setGrnGate(null)} okText="Post goods receipt" width={1000} destroyOnHidden>
        {grnGate && (
          <Form form={rForm} layout="vertical">
            <Alert type="info" showIcon style={{ marginBottom: 16 }}
              message="Split each received quantity into accepted and rejected. Rejected quantity never enters stock; accepted quantity is posted to the selected location and the item's average cost is recalculated." />
            <Form.Item name="locationId" label="Receiving location" rules={[{ required: true, message: 'Choose where to put the stock' }]} style={{ maxWidth: 420 }}>
              <LocationSelect warehouseId={poOf(grnGate.poId).warehouseId} />
            </Form.Item>
            <Form.List name="lines">
              {(fields) => fields.map((f) => {
                const line = rForm.getFieldValue(['lines', f.name]) as LineForm;
                const item = items.get(line.itemId)!;
                return (
                  <Card size="small" key={f.key} style={{ marginBottom: 12 }}
                    title={<Space wrap><b>{item.code}</b>{item.name}<Tag>{item.tracking}</Tag></Space>}
                    extra={<Typography.Text type="secondary">Outstanding {fmtQty(line.outstanding)} {item.uom}</Typography.Text>}>
                    <Row gutter={8}>
                      <Col xs={8} md={4}><Form.Item name={[f.name, 'receivedQty']} label="Received"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                      <Col xs={8} md={4}><Form.Item name={[f.name, 'acceptedQty']} label="Accepted"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                      <Col xs={8} md={4}><Form.Item name={[f.name, 'rejectedQty']} label="Rejected"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                      <Col xs={24} md={12}><Form.Item name={[f.name, 'rejectReason']} label="Reject reason"><Input placeholder="Required if any quantity is rejected" /></Form.Item></Col>
                      {item.tracking === 'LOT' && (
                        <>
                          <Col xs={12} md={6}><Form.Item name={[f.name, 'lotNo']} label="Supplier lot no." rules={[{ required: true }]}><Input /></Form.Item></Col>
                          <Col xs={12} md={6}><Form.Item name={[f.name, 'expiry']} label="Expiry date"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
                        </>
                      )}
                      {item.tracking === 'SERIAL' && (
                        <Col span={24}>
                          <Form.Item name={[f.name, 'serialNos']} label="Serial numbers (one per accepted unit; type and press Enter)">
                            <Select mode="tags" tokenSeparators={[',', ' ']} open={false} placeholder="e.g. LT-24007" />
                          </Form.Item>
                        </Col>
                      )}
                    </Row>
                  </Card>
                );
              })}
            </Form.List>
          </Form>
        )}
      </Modal>
    </>
  );
}
