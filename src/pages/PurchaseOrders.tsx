import { Button, Col, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Progress, Row, Segmented, Select, Space, Table, Timeline, Tooltip, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined, SendOutlined, StopOutlined, UploadOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { api, svc } from '../domain/api';
import type { PurchaseOrder } from '../domain/types';
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, ItemSelect, PageHeader, StatusTag, usePerm, useLookups, useRunner } from '../components/common';

const FILTERS = ['Open', 'All', 'Draft', 'Pending approval', 'Awaiting receipt', 'Closed'] as const;

export default function PurchaseOrders() {
  const { db, items, suppliers, users, warehouses } = useLookups();
  const canManage = usePerm('acquisition.manage');
  const run = useRunner();
  const location = useLocation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Open');
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  // Prefill from the replenishment planner
  useEffect(() => {
    const prefill = (location.state as { prefill?: { itemId: string; qty: number }[] } | null)?.prefill;
    if (prefill?.length) {
      openCreate(prefill.map((p) => ({ itemId: p.itemId, qty: p.qty, unitPrice: items.get(p.itemId)?.avgCost ?? 0 })));
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const openCreate = (lines = [{ itemId: undefined, qty: 1, unitPrice: 0 }] as { itemId?: string; qty: number; unitPrice: number }[]) => {
    form.resetFields();
    form.setFieldsValue({ warehouseId: 'w-main', expectedDate: dayjs().add(7, 'day'), lines });
    setCreating(true);
  };

  const rows = useMemo(() => {
    const f: Record<string, (p: PurchaseOrder) => boolean> = {
      Open: (p) => !['RECEIVED', 'CANCELLED'].includes(p.status),
      All: () => true,
      Draft: (p) => ['DRAFT', 'REJECTED'].includes(p.status),
      'Pending approval': (p) => p.status === 'PENDING_APPROVAL',
      'Awaiting receipt': (p) => ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(p.status),
      Closed: (p) => ['RECEIVED', 'CANCELLED'].includes(p.status),
    };
    return [...db.purchaseOrders].filter(f[filter]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [db, filter]);

  const create = async () => {
    const v = await form.validateFields();
    const po = run(
      () => api.createPO({ ...v, expectedDate: v.expectedDate.format('YYYY-MM-DD') }),
      (p) => `${p.no} saved as draft`,
    );
    if (po) setCreating(false);
  };

  const locked = canManage ? undefined : 'Requires acquisition.manage (Procurement role)';

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle="Draft → approval → sent to supplier → received against gate entries"
        extra={
          <Tooltip title={locked}>
            <Button type="primary" icon={<PlusOutlined />} disabled={!canManage} onClick={() => openCreate()}>New purchase order</Button>
          </Tooltip>
        }
      />
      <Segmented options={[...FILTERS]} value={filter} onChange={(v) => setFilter(v as typeof filter)} style={{ marginBottom: 16, maxWidth: '100%', overflowX: 'auto' }} />
      <Table
        rowKey="id"
        dataSource={rows}
        scroll={{ x: 1000 }}
        expandable={{
          expandedRowRender: (po) => {
            const appr = db.approvals.filter((a) => a.docId === po.id).flatMap((a) => a.history);
            return (
              <Row gutter={24}>
                <Col xs={24} lg={16}>
                  <Table size="small" rowKey="id" pagination={false} dataSource={po.lines}
                    columns={[
                      { title: 'Item', render: (_, l) => `${items.get(l.itemId)?.code} - ${items.get(l.itemId)?.name}` },
                      { title: 'Ordered', align: 'right', render: (_, l) => `${fmtQty(l.qty)} ${items.get(l.itemId)?.uom}` },
                      { title: 'Unit price', align: 'right', render: (_, l) => fmtMoney(l.unitPrice) },
                      { title: 'Accepted', align: 'right', render: (_, l) => fmtQty(l.receivedQty) },
                      { title: 'Rejected', align: 'right', render: (_, l) => (l.rejectedQty ? <Typography.Text type="danger">{fmtQty(l.rejectedQty)}</Typography.Text> : 0) },
                      { title: 'Progress', width: 140, render: (_, l) => <Progress percent={Math.round((l.receivedQty / l.qty) * 100)} size="small" /> },
                    ]} />
                  {po.remarks && <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>Remarks: {po.remarks}</Typography.Paragraph>}
                </Col>
                <Col xs={24} lg={8}>
                  <Typography.Text strong>Approval history</Typography.Text>
                  <Timeline style={{ marginTop: 12 }}
                    items={appr.length ? appr.map((h) => ({
                      color: h.action === 'APPROVED' ? 'green' : h.action === 'REJECTED' ? 'red' : 'blue',
                      children: <>{h.action} by {users.get(h.userId)?.name}<br /><Typography.Text type="secondary">{fmtDateTime(h.at)}{h.remarks ? ` · ${h.remarks}` : ''}</Typography.Text></>,
                    })) : [{ color: 'gray', children: 'Not yet submitted' }]} />
                </Col>
              </Row>
            );
          },
        }}
        columns={[
          { title: 'PO', dataIndex: 'no', render: (v) => <b>{v}</b> },
          { title: 'Supplier', render: (_, p) => suppliers.get(p.supplierId)?.name },
          { title: 'Deliver to', render: (_, p) => warehouses.get(p.warehouseId)?.code },
          { title: 'Expected', render: (_, p) => fmtDate(p.expectedDate) },
          { title: 'Value', align: 'right', render: (_, p) => fmtMoney(svc.poTotal(p)) },
          { title: 'Status', render: (_, p) => <StatusTag status={p.status} /> },
          {
            title: 'Actions', width: 260,
            render: (_, p) => (
              <Space wrap>
                {['DRAFT', 'REJECTED'].includes(p.status) && (
                  <Tooltip title={locked}><Button size="small" type="primary" icon={<UploadOutlined />} disabled={!canManage} onClick={() => run(() => api.submitPO(p.id), `${p.no} submitted for approval`)}>Submit</Button></Tooltip>
                )}
                {p.status === 'APPROVED' && (
                  <Tooltip title={locked}><Button size="small" type="primary" icon={<SendOutlined />} disabled={!canManage} onClick={() => run(() => api.sendPO(p.id), `${p.no} sent to supplier`)}>Send</Button></Tooltip>
                )}
                {p.status === 'PENDING_APPROVAL' && <Typography.Text type="secondary">Waiting for approver</Typography.Text>}
                {['SENT', 'PARTIALLY_RECEIVED'].includes(p.status) && <Typography.Text type="secondary">Awaiting delivery</Typography.Text>}
                {!['RECEIVED', 'CANCELLED', 'PARTIALLY_RECEIVED'].includes(p.status) && (
                  <Popconfirm title={`Cancel ${p.no}?`} onConfirm={() => run(() => api.cancelPO(p.id), `${p.no} cancelled`)} disabled={!canManage}>
                    <Button size="small" danger icon={<StopOutlined />} disabled={!canManage} aria-label="Cancel PO" />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal title="New purchase order" open={creating} onOk={create} onCancel={() => setCreating(false)} okText="Save draft" width={820} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col xs={24} md={10}>
              <Form.Item name="supplierId" label="Supplier" rules={[{ required: true, message: 'Select a supplier' }]}>
                <Select showSearch optionFilterProp="label" options={db.suppliers.map((s) => ({ value: s.id, label: `${s.code} - ${s.name}` }))} />
              </Form.Item>
            </Col>
            <Col xs={12} md={7}>
              <Form.Item name="warehouseId" label="Deliver to" rules={[{ required: true }]}>
                <Select options={db.warehouses.map((w) => ({ value: w.id, label: w.name }))} />
              </Form.Item>
            </Col>
            <Col xs={12} md={7}>
              <Form.Item name="expectedDate" label="Expected delivery" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
            </Col>
          </Row>
          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f) => (
                  <Row gutter={8} key={f.key} align="top">
                    <Col xs={24} md={12}><Form.Item name={[f.name, 'itemId']} label={f.name === 0 ? 'Item' : undefined} rules={[{ required: true, message: 'Select item' }]}><ItemSelect /></Form.Item></Col>
                    <Col xs={9} md={5}><Form.Item name={[f.name, 'qty']} label={f.name === 0 ? 'Qty' : undefined} rules={[{ required: true }]}><InputNumber min={0.001} style={{ width: '100%' }} /></Form.Item></Col>
                    <Col xs={11} md={5}><Form.Item name={[f.name, 'unitPrice']} label={f.name === 0 ? 'Unit price' : undefined} rules={[{ required: true }]}><InputNumber min={0} prefix="$" style={{ width: '100%' }} /></Form.Item></Col>
                    <Col xs={4} md={2}><Form.Item label={f.name === 0 ? ' ' : undefined}><Button icon={<DeleteOutlined />} onClick={() => remove(f.name)} disabled={fields.length === 1} aria-label="Remove line" /></Form.Item></Col>
                  </Row>
                ))}
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ qty: 1, unitPrice: 0 })} block>Add line</Button>
              </>
            )}
          </Form.List>
          <Form.Item name="remarks" label="Remarks" style={{ marginTop: 16 }}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item noStyle shouldUpdate>
            {() => {
              const lines = (form.getFieldValue('lines') ?? []) as { qty?: number; unitPrice?: number }[];
              const total = lines.reduce((s, l) => s + (l?.qty ?? 0) * (l?.unitPrice ?? 0), 0);
              return <Descriptions size="small"><Descriptions.Item label="Order value">{fmtMoney(total)}</Descriptions.Item></Descriptions>;
            }}
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
