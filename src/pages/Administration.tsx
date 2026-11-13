import { Alert, Button, Card, Col, Descriptions, Popconfirm, Result, Row, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import { BugOutlined, ClockCircleOutlined, ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { api } from '../domain/api';
import type { ReconMismatch } from '../domain/services';
import { ROLE_LABEL, ROLE_PERMISSIONS } from '../domain/types';
import { fmtQty, PageHeader, StatusTag, usePerm, useLookups, useRunner } from '../components/common';

export default function Administration() {
  const { db, items, locations, lots } = useLookups();
  const isAdmin = usePerm('admin.manage');
  const run = useRunner();
  const [recon, setRecon] = useState<{ checked: number; mismatches: ReconMismatch[]; at: string } | null>(null);
  const locked = isAdmin ? undefined : 'Requires admin.manage (Administrator role)';

  const reconcile = (fix: boolean) => {
    const r = run(() => api.runReconciliation(fix), (x) => (fix ? `Corrected ${x.mismatches.length} balance(s)` : `Checked ${x.checked} balances`));
    if (r) setRecon({ ...(fix ? { ...r, mismatches: [] } : r), at: new Date().toLocaleTimeString() });
  };

  return (
    <>
      <PageHeader title="Administration" subtitle="Accounting periods, ledger reconciliation, jobs, users and roles" />
      {!isAdmin && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Switch to the Administrator role (top-right menu) to change settings here." />}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title={<><SafetyCertificateOutlined /> Ledger reconciliation</>}>
            <Typography.Paragraph type="secondary">
              Rebuilds every balance from the immutable ledger and compares it with the cached bucket values.
            </Typography.Paragraph>
            <Space wrap>
              <Tooltip title={locked}><Button type="primary" disabled={!isAdmin} onClick={() => reconcile(false)}>Run reconciliation</Button></Tooltip>
              <Tooltip title={locked ?? 'Demo: corrupt one cached balance so reconciliation finds a mismatch'}>
                <Button icon={<BugOutlined />} disabled={!isAdmin} onClick={() => run(() => { api.simulateDrift(); return true; }, 'Injected drift into a cached balance')}>Simulate drift</Button>
              </Tooltip>
            </Space>
            {recon && (
              recon.mismatches.length ? (
                <>
                  <Alert style={{ marginTop: 16 }} type="error" showIcon message={`${recon.mismatches.length} mismatch(es) across ${recon.checked} balances (run ${recon.at})`} />
                  <Table size="small" rowKey="key" pagination={false} style={{ marginTop: 8 }} dataSource={recon.mismatches}
                    columns={[
                      { title: 'Item', render: (_, m) => items.get(m.itemId)?.code },
                      { title: 'Location', render: (_, m) => locations.get(m.locationId)?.code },
                      { title: 'Lot', render: (_, m) => (m.lotId ? lots.get(m.lotId)?.lotNo : '-') },
                      { title: 'Cached on hand', align: 'right', render: (_, m) => fmtQty(m.cached.onHand) },
                      { title: 'Ledger on hand', align: 'right', render: (_, m) => fmtQty(m.rebuilt.onHand) },
                    ]} />
                  <Button danger style={{ marginTop: 8 }} onClick={() => reconcile(true)}>Rebuild cached balances from ledger</Button>
                </>
              ) : <Result status="success" title="Ledger and balances agree" subTitle={`${recon.checked} balances checked at ${recon.at}`} style={{ padding: 16 }} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Accounting periods">
            <Typography.Paragraph type="secondary">Postings dated in a closed month are refused by the posting service.</Typography.Paragraph>
            <Table size="small" rowKey="month" pagination={false} dataSource={[...db.periods].reverse()}
              columns={[
                { title: 'Month', dataIndex: 'month', render: (v) => <b className="mono">{v}</b> },
                { title: 'Status', render: (_, p) => <StatusTag status={p.status} /> },
                { title: 'Postings', align: 'right', render: (_, p) => db.txns.filter((t) => t.at.startsWith(p.month)).length },
                {
                  title: 'Open', render: (_, p) => (
                    <Tooltip title={locked}>
                      <Switch size="small" checked={p.status === 'OPEN'} disabled={!isAdmin}
                        onChange={(on) => run(() => { api.setPeriodStatus(p.month, on ? 'OPEN' : 'CLOSED'); return true; }, `Period ${p.month} ${on ? 'reopened' : 'closed'}`)} />
                    </Tooltip>
                  ),
                },
              ]} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={<><ClockCircleOutlined /> Jobs</>}>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="Expiry sweep">
                <Space wrap>
                  Blocks remaining available stock in expired lots.
                  <Tooltip title={locked}><Button size="small" disabled={!isAdmin} onClick={() => run(() => api.runExpirySweep(), (n) => `Expiry sweep blocked ${n} balance(s)`)}>Run now</Button></Tooltip>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Demo data">
                <Space wrap>
                  Restore the original demonstration dataset.
                  <Popconfirm title="Reset all demo data?" description="Everything you posted in this browser will be discarded." onConfirm={() => run(() => { api.resetDemo(); return true; }, 'Demo data restored')}>
                    <Button size="small" danger icon={<ReloadOutlined />}>Reset demo</Button>
                  </Popconfirm>
                </Space>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Users & roles">
            <Table size="small" rowKey="id" pagination={false} dataSource={db.users}
              columns={[
                { title: 'User', dataIndex: 'name' },
                { title: 'Username', dataIndex: 'username', render: (v) => <span className="mono">{v}</span> },
                { title: 'Role', render: (_, u) => ROLE_LABEL[u.role] },
                { title: 'Permission', render: (_, u) => ROLE_PERMISSIONS[u.role].map((p) => <Tag key={p}>{p}</Tag>) },
              ]} />
            <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
              Permissions are checked inside the service on every write, not only by hiding buttons.
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>
    </>
  );
}
