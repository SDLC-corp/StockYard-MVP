import { Alert, Button, Card, Input, Modal, Segmented, Space, Table, Tag, Timeline, Tooltip, Typography } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { api } from '../domain/api';
import type { ApprovalRequest } from '../domain/types';
import { fmtDateTime, fmtMoney, PageHeader, StatusTag, usePerm, useLookups, useRunner } from '../components/common';
import { useSessionUser } from '../domain/api';

export default function Approvals() {
  const { db, users } = useLookups();
  const me = useSessionUser()!;
  const canAct = usePerm('approval.act');
  const run = useRunner();
  const [view, setView] = useState<'Pending' | 'History'>('Pending');
  const [acting, setActing] = useState<{ req: ApprovalRequest; action: 'APPROVED' | 'REJECTED' } | null>(null);
  const [remarks, setRemarks] = useState('');

  const rows = [...db.approvals]
    .filter((a) => (view === 'Pending' ? a.status === 'PENDING' : a.status !== 'PENDING'))
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

  const confirm = () => {
    if (!acting) return;
    const ok = run(() => { api.actOnApproval(acting.req.id, acting.action, remarks); return true; },
      `${acting.req.docNo} ${acting.action === 'APPROVED' ? 'approved' : 'rejected'}`);
    if (ok) setActing(null);
  };

  const reasonFor = (a: ApprovalRequest) =>
    !canAct ? 'Requires approval.act (Approver role)' : a.requestedBy === me.id ? 'You cannot approve your own request' : undefined;

  return (
    <>
      <PageHeader title="Approvals" subtitle="One approval engine and one queue for purchase orders and stock adjustments" />
      {!canAct && <Alert showIcon type="info" style={{ marginBottom: 16 }} message="Switch to the Approver role (top-right menu) to act on this queue." />}
      <Card>
        <Segmented options={['Pending', 'History']} value={view} onChange={(v) => setView(v as typeof view)} style={{ marginBottom: 12 }} />
        <Table
          rowKey="id"
          dataSource={rows}
          scroll={{ x: 900 }}
          expandable={{
            expandedRowRender: (a) => (
              <Timeline items={a.history.map((h) => ({
                color: h.action === 'APPROVED' ? 'green' : h.action === 'REJECTED' ? 'red' : 'blue',
                children: <>{h.action} by {users.get(h.userId)?.name} · <Typography.Text type="secondary">{fmtDateTime(h.at)}{h.remarks ? ` · "${h.remarks}"` : ''}</Typography.Text></>,
              }))} />
            ),
          }}
          columns={[
            { title: 'Document', render: (_, a) => <><Tag>{a.docType.replace('_', ' ')}</Tag><b>{a.docNo}</b></> },
            { title: 'Summary', dataIndex: 'summary' },
            { title: 'Amount', align: 'right', render: (_, a) => fmtMoney(a.amount) },
            { title: 'Requested by', render: (_, a) => users.get(a.requestedBy)?.name },
            { title: 'Requested', render: (_, a) => fmtDateTime(a.requestedAt) },
            { title: 'Status', render: (_, a) => <StatusTag status={a.status} /> },
            {
              title: 'Decision', width: 210,
              render: (_, a) => a.status === 'PENDING' && (
                <Tooltip title={reasonFor(a)}>
                  <Space>
                    <Button size="small" type="primary" icon={<CheckOutlined />} disabled={!!reasonFor(a)} onClick={() => { setRemarks(''); setActing({ req: a, action: 'APPROVED' }); }}>Approve</Button>
                    <Button size="small" danger icon={<CloseOutlined />} disabled={!!reasonFor(a)} onClick={() => { setRemarks(''); setActing({ req: a, action: 'REJECTED' }); }}>Reject</Button>
                  </Space>
                </Tooltip>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={acting ? `${acting.action === 'APPROVED' ? 'Approve' : 'Reject'} ${acting.req.docNo}` : ''}
        open={!!acting}
        onOk={confirm}
        onCancel={() => setActing(null)}
        okText={acting?.action === 'APPROVED' ? 'Approve' : 'Reject'}
        okButtonProps={{ danger: acting?.action === 'REJECTED' }}
      >
        <Typography.Paragraph>{acting?.req.summary}</Typography.Paragraph>
        {acting?.req.docType === 'ADJUSTMENT' && acting.action === 'APPROVED' && (
          <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Approving will post the adjustment to the stock ledger immediately." />
        )}
        <Input.TextArea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={acting?.action === 'REJECTED' ? 'Remarks (required)' : 'Remarks (optional)'} />
      </Modal>
    </>
  );
}
