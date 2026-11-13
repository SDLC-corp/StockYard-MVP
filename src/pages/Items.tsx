import { Button, Col, Form, Input, InputNumber, Modal, Row, Select, Switch, Table, Tag, Tooltip } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { api, svc } from '../domain/api';
import type { Item } from '../domain/types';
import { fmtMoney, fmtQty, PageHeader, usePerm, useLookups, useRunner } from '../components/common';

export default function Items() {
  const { db } = useLookups();
  const canEdit = usePerm('admin.manage');
  const run = useRunner();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [form] = Form.useForm();

  const rows = useMemo(
    () =>
      db.items
        .filter((i) => `${i.code} ${i.name} ${i.group}`.toLowerCase().includes(q.toLowerCase()))
        .map((i) => ({ ...i, totals: svc.itemTotals(db, i.id) })),
    [db, q],
  );
  const groups = [...new Set(db.items.map((i) => i.group))];

  const open = (item?: Item) => {
    const v = item ?? { tracking: 'NONE', uom: 'EA', active: true, safetyStock: 0, reorderPoint: 0, reorderQty: 0 };
    setEditing(v);
    form.setFieldsValue(v);
  };
  const save = async () => {
    const v = await form.validateFields();
    const ok = run(() => api.saveItem({ ...editing, ...v }), editing?.id ? 'Item updated' : 'Item created');
    if (ok) setEditing(null);
  };

  return (
    <>
      <PageHeader
        title="Items"
        subtitle="Item master: tracking type, unit of measure and planning parameters"
        extra={
          <>
            <Input.Search placeholder="Search items" allowClear onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
            <Tooltip title={canEdit ? undefined : 'Only administrators can edit masters (admin.manage)'}>
              <Button type="primary" icon={<PlusOutlined />} disabled={!canEdit} onClick={() => open()}>New item</Button>
            </Tooltip>
          </>
        }
      />
      <Table
        rowKey="id"
        dataSource={rows}
        scroll={{ x: 1000 }}
        columns={[
          { title: 'Code', dataIndex: 'code', sorter: (a, b) => a.code.localeCompare(b.code), render: (v) => <b>{v}</b> },
          { title: 'Name', dataIndex: 'name' },
          { title: 'Group', dataIndex: 'group', filters: groups.map((g) => ({ text: g, value: g })), onFilter: (v, r) => r.group === v },
          { title: 'UoM', dataIndex: 'uom' },
          {
            title: 'Tracking', dataIndex: 'tracking',
            render: (v) => <Tag color={v === 'LOT' ? 'orange' : v === 'SERIAL' ? 'purple' : 'default'}>{v}</Tag>,
          },
          { title: 'On hand', align: 'right', render: (_, r) => fmtQty(r.totals.onHand) },
          { title: 'Available', align: 'right', render: (_, r) => fmtQty(r.totals.available) },
          { title: 'SS / ROP', align: 'right', render: (_, r) => `${r.safetyStock} / ${r.reorderPoint}` },
          { title: 'Avg cost', align: 'right', render: (_, r) => fmtMoney(r.avgCost) },
          { title: 'Active', dataIndex: 'active', render: (v) => (v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>) },
          {
            title: '', width: 60,
            render: (_, r) => <Button size="small" icon={<EditOutlined />} disabled={!canEdit} onClick={() => open(r)} aria-label="Edit item" />,
          },
        ]}
      />
      <Modal title={editing?.id ? `Edit ${editing.code}` : 'New item'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="Save" width={640} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={8}><Form.Item name="code" label="Code" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={16}><Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="group" label="Group" rules={[{ required: true }]}><Input list="groups" /></Form.Item></Col>
            <Col span={8}><Form.Item name="uom" label="Unit of measure" rules={[{ required: true }]}><Select options={['EA', 'BOX', 'BTL', 'L', 'KG', 'M', 'SET'].map((u) => ({ value: u, label: u }))} /></Form.Item></Col>
            <Col span={8}>
              <Form.Item name="tracking" label="Tracking" rules={[{ required: true }]} extra={editing?.id ? 'Locked once stock is posted' : undefined}>
                <Select options={[{ value: 'NONE', label: 'None' }, { value: 'LOT', label: 'Lot & expiry' }, { value: 'SERIAL', label: 'Serial number' }]} />
              </Form.Item>
            </Col>
            <Col span={8}><Form.Item name="safetyStock" label="Safety stock" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="reorderPoint" label="Reorder point" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="reorderQty" label="Reorder qty" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="active" label="Active" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
          <datalist id="groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        </Form>
      </Modal>
    </>
  );
}
