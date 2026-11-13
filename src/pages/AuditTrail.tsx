import { Card, Col, Input, Row, Select, Table, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { fmtDateTime, PageHeader, useLookups } from '../components/common';

export default function AuditTrail() {
  const { db, users } = useLookups();
  const [entity, setEntity] = useState<string>();
  const [userId, setUserId] = useState<string>();
  const [q, setQ] = useState('');
  const entities = [...new Set(db.audit.map((a) => a.entity))].sort();

  const rows = useMemo(
    () => [...db.audit]
      .filter((a) => (!entity || a.entity === entity) && (!userId || a.userId === userId))
      .filter((a) => !q || `${a.summary} ${a.action}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.at.localeCompare(a.at)),
    [db, entity, userId, q],
  );

  return (
    <>
      <PageHeader title="Audit Trail" subtitle="Changes, approvals, postings, reversals, cost updates and period changes, with old and new values. Read-only for every role." />
      <Card>
        <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
          <Col xs={12} md={6}><Select allowClear placeholder="All entities" style={{ width: '100%' }} value={entity} onChange={setEntity} options={entities.map((e) => ({ value: e, label: e }))} /></Col>
          <Col xs={12} md={6}><Select allowClear placeholder="All users" style={{ width: '100%' }} value={userId} onChange={setUserId} options={db.users.map((u) => ({ value: u.id, label: u.name }))} /></Col>
          <Col xs={24} md={12}><Input.Search placeholder="Search summary" allowClear onChange={(e) => setQ(e.target.value)} /></Col>
        </Row>
        <Table
          size="small"
          rowKey="id"
          dataSource={rows}
          scroll={{ x: 800 }}
          pagination={{ pageSize: 25, showSizeChanger: false }}
          expandable={{
            rowExpandable: (a) => a.before !== undefined || a.after !== undefined,
            expandedRowRender: (a) => (
              <Row gutter={16}>
                <Col xs={24} md={12}><Typography.Text strong>Old value</Typography.Text><pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{a.before === undefined ? '-' : JSON.stringify(a.before, null, 2)}</pre></Col>
                <Col xs={24} md={12}><Typography.Text strong>New value</Typography.Text><pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{a.after === undefined ? '-' : JSON.stringify(a.after, null, 2)}</pre></Col>
              </Row>
            ),
          }}
          columns={[
            { title: 'When', render: (_, a) => <span className="mono">{fmtDateTime(a.at)}</span>, width: 170 },
            { title: 'User', render: (_, a) => users.get(a.userId)?.name, width: 140 },
            { title: 'Entity', dataIndex: 'entity', render: (v) => <Tag>{v}</Tag>, width: 130 },
            { title: 'Action', dataIndex: 'action', render: (v) => <Tag color="blue">{v}</Tag>, width: 140 },
            { title: 'Summary', dataIndex: 'summary' },
          ]}
        />
      </Card>
    </>
  );
}
