import { Alert, Button, Card, Col, Form, InputNumber, Radio, Row, Table, Tooltip } from 'antd';
import { ArrowRightOutlined, CheckOutlined } from '@ant-design/icons';
import { useEffect } from 'react';
import { api } from '../domain/api';
import { fmtDateTime, fmtQty, ItemSelect, LocationSelect, LotSelect, PageHeader, SerialSelect, StatusTag, usePerm, useLookups, useRunner } from '../components/common';

export default function Transfers() {
  const { db, items, locations, lots, serials } = useLookups();
  const canPost = usePerm('inventory.post');
  const run = useRunner();
  const [form] = Form.useForm();
  const itemId: string | undefined = Form.useWatch('itemId', form);
  const fromLocationId: string | undefined = Form.useWatch('fromLocationId', form);
  const serialIds: string[] | undefined = Form.useWatch('serialIds', form);
  const item = itemId ? items.get(itemId) : undefined;
  const locked = canPost ? undefined : 'Requires inventory.post (Storekeeper role)';

  useEffect(() => { form.setFieldsValue({ fromLocationId: undefined, toLocationId: undefined, lotId: undefined, serialIds: [] }); }, [itemId, form]);
  useEffect(() => { if (item?.tracking === 'SERIAL') form.setFieldValue('qty', serialIds?.length || undefined); }, [serialIds, item, form]);

  const submit = async () => {
    const v = await form.validateFields();
    if (run(() => api.createTransfer({ ...v, lotId: v.lotId ?? null }), (t) => `${t.no} ${t.status === 'RECEIVED' ? 'completed' : 'dispatched'}`)) {
      form.resetFields();
    }
  };

  const rows = [...db.transfers].reverse();

  return (
    <>
      <PageHeader title="Transfers" subtitle="Direct transfers move stock at once. In-transit transfers count only toward IN_TRANSIT until received, so stock never appears in two sites." />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={9}>
          <Card title="New transfer">
            <Form form={form} layout="vertical" onFinish={submit} initialValues={{ mode: 'IN_TRANSIT' }}>
              <Form.Item name="mode" label="Mode">
                <Radio.Group optionType="button" buttonStyle="solid" options={[{ value: 'DIRECT', label: 'Direct' }, { value: 'IN_TRANSIT', label: 'In transit (dispatch → receive)' }]} />
              </Form.Item>
              <Form.Item name="itemId" label="Item" rules={[{ required: true }]}><ItemSelect /></Form.Item>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="fromLocationId" label="From" rules={[{ required: true }]}><LocationSelect withStockOf={itemId} /></Form.Item></Col>
                <Col span={12}><Form.Item name="toLocationId" label="To" rules={[{ required: true }]}><LocationSelect exclude={fromLocationId} /></Form.Item></Col>
              </Row>
              {item?.tracking === 'LOT' && <Form.Item name="lotId" label="Lot" rules={[{ required: true }]}><LotSelect itemId={itemId} locationId={fromLocationId} /></Form.Item>}
              {item?.tracking === 'SERIAL' && <Form.Item name="serialIds" label="Serials" rules={[{ required: true }]}><SerialSelect itemId={itemId} locationId={fromLocationId} statuses={['AVAILABLE']} /></Form.Item>}
              <Form.Item name="qty" label={`Quantity${item ? ` (${item.uom})` : ''}`} rules={[{ required: true }]}>
                <InputNumber min={0.001} style={{ width: '100%' }} disabled={item?.tracking === 'SERIAL'} />
              </Form.Item>
              <Tooltip title={locked}><Button type="primary" htmlType="submit" block disabled={!canPost}>Dispatch transfer</Button></Tooltip>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={15}>
          <Card title="Transfers">
            {rows.some((t) => t.status === 'DISPATCHED') && (
              <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Dispatched transfers are held in IN_TRANSIT at the destination until received." />
            )}
            <Table size="small" rowKey="id" dataSource={rows} scroll={{ x: 760 }}
              columns={[
                { title: 'No', dataIndex: 'no', render: (v) => <b>{v}</b> },
                { title: 'Mode', dataIndex: 'mode', render: (v) => v.replace('_', ' ') },
                { title: 'Item', render: (_, t) => <>{items.get(t.itemId)?.code}{t.lotId ? ` · ${lots.get(t.lotId)?.lotNo}` : ''}{t.serialIds.length ? ` · ${t.serialIds.map((s) => serials.get(s)?.serialNo).join(', ')}` : ''}</> },
                { title: 'Route', render: (_, t) => <>{locations.get(t.fromLocationId)?.code} <ArrowRightOutlined /> {locations.get(t.toLocationId)?.code}</> },
                { title: 'Qty', align: 'right', render: (_, t) => fmtQty(t.qty) },
                { title: 'Dispatched', render: (_, t) => fmtDateTime(t.dispatchedAt) },
                { title: 'Status', render: (_, t) => <StatusTag status={t.status} /> },
                {
                  title: '', render: (_, t) => t.status === 'DISPATCHED' && (
                    <Tooltip title={locked}>
                      <Button size="small" type="primary" icon={<CheckOutlined />} disabled={!canPost} onClick={() => run(() => api.receiveTransfer(t.id), `${t.no} received`)}>Receive</Button>
                    </Tooltip>
                  ),
                },
              ]} />
          </Card>
        </Col>
      </Row>
    </>
  );
}
