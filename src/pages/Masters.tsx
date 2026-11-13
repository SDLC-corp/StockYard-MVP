import { Button, Card, Form, Input, InputNumber, Modal, Select, Table, Tabs, Tooltip } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { api } from '../domain/api';
import type { Supplier } from '../domain/types';
import { PageHeader, usePerm, useLookups, useRunner } from '../components/common';

export default function Masters() {
  const { db, warehouses } = useLookups();
  const canEdit = usePerm('admin.manage');
  const run = useRunner();
  const [supplier, setSupplier] = useState<Partial<Supplier> | null>(null);
  const [locOpen, setLocOpen] = useState(false);
  const [sForm] = Form.useForm();
  const [lForm] = Form.useForm();
  const lockedHint = canEdit ? undefined : 'Only administrators can edit masters (admin.manage)';

  const saveSupplier = async () => {
    const v = await sForm.validateFields();
    if (run(() => api.saveSupplier({ ...supplier, ...v }), 'Supplier saved')) setSupplier(null);
  };
  const saveLoc = async () => {
    const v = await lForm.validateFields();
    if (run(() => api.saveLocation(v), 'Location created')) setLocOpen(false);
  };

  return (
    <>
      <PageHeader title="Suppliers & Locations" subtitle="Masters: suppliers, departments, warehouses and storage locations" />
      <Tabs
        items={[
          {
            key: 's', label: 'Suppliers',
            children: (
              <Card extra={<Tooltip title={lockedHint}><Button type="primary" icon={<PlusOutlined />} disabled={!canEdit} onClick={() => { setSupplier({ leadTimeDays: 7 }); sForm.setFieldsValue({ code: '', name: '', email: '', leadTimeDays: 7 }); }}>New supplier</Button></Tooltip>}>
                <Table rowKey="id" dataSource={db.suppliers} pagination={false} scroll={{ x: 600 }}
                  columns={[
                    { title: 'Code', dataIndex: 'code', render: (v) => <b>{v}</b> },
                    { title: 'Name', dataIndex: 'name' },
                    { title: 'Email', dataIndex: 'email' },
                    { title: 'Lead time (days)', dataIndex: 'leadTimeDays', align: 'right' },
                    { title: 'POs', align: 'right', render: (_, s) => db.purchaseOrders.filter((p) => p.supplierId === s.id).length },
                    { title: '', width: 60, render: (_, s) => <Button size="small" icon={<EditOutlined />} disabled={!canEdit} aria-label="Edit supplier" onClick={() => { setSupplier(s); sForm.setFieldsValue(s); }} /> },
                  ]} />
              </Card>
            ),
          },
          {
            key: 'l', label: 'Warehouses & locations',
            children: (
              <Card extra={<Tooltip title={lockedHint}><Button type="primary" icon={<PlusOutlined />} disabled={!canEdit} onClick={() => { lForm.resetFields(); setLocOpen(true); }}>New location</Button></Tooltip>}>
                <Table rowKey="id" dataSource={db.locations} pagination={false}
                  columns={[
                    { title: 'Warehouse', render: (_, l) => `${warehouses.get(l.warehouseId)?.code} - ${warehouses.get(l.warehouseId)?.name}` },
                    { title: 'Location', dataIndex: 'code', render: (v) => <b>{v}</b> },
                    { title: 'Name', dataIndex: 'name' },
                    { title: 'Stock rows', align: 'right', render: (_, l) => Object.values(db.balances).filter((b) => b.locationId === l.id && (b.onHand || b.inTransit)).length },
                  ]} />
              </Card>
            ),
          },
          {
            key: 'd', label: 'Departments',
            children: (
              <Card>
                <Table rowKey="id" dataSource={db.departments} pagination={false}
                  columns={[{ title: 'Code', dataIndex: 'code', render: (v) => <b>{v}</b> }, { title: 'Name', dataIndex: 'name' }]} />
              </Card>
            ),
          },
        ]}
      />
      <Modal title={supplier?.id ? `Edit ${supplier.code}` : 'New supplier'} open={!!supplier} onOk={saveSupplier} onCancel={() => setSupplier(null)} okText="Save" destroyOnHidden>
        <Form form={sForm} layout="vertical">
          <Form.Item name="code" label="Code" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="leadTimeDays" label="Lead time (days)" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
      <Modal title="New location" open={locOpen} onOk={saveLoc} onCancel={() => setLocOpen(false)} okText="Create" destroyOnHidden>
        <Form form={lForm} layout="vertical">
          <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true }]}>
            <Select options={db.warehouses.map((w) => ({ value: w.id, label: `${w.code} - ${w.name}` }))} />
          </Form.Item>
          <Form.Item name="code" label="Location code" rules={[{ required: true }]}><Input placeholder="e.g. MAIN-C01" /></Form.Item>
          <Form.Item name="name" label="Description"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
