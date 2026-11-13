import { Alert, Button, Card, Divider, Form, Input, List, Space, Typography } from 'antd';
import { DatabaseOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { session } from '../domain/api';
import { DEMO_USERS } from '../domain/seed';
import { ROLE_LABEL, ROLE_PERMISSIONS } from '../domain/types';

const ROLE_BLURB: Record<string, string> = {
  STOREKEEPER: 'Receives deliveries, issues & returns, reservations, transfers',
  PROCUREMENT: 'Raises purchase orders and tracks them to receipt',
  APPROVER: 'Single queue to approve or reject POs and adjustments',
  ADMIN: 'Masters, accounting periods, reconciliation, audit',
};

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();

  const submit = (v: { username: string; password: string }) => {
    try {
      session.login(v.username, v.password);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="login-wrap">
      <Card style={{ width: '100%', maxWidth: 440 }} styles={{ body: { padding: 28 } }}>
        <Space align="center" style={{ marginBottom: 4 }}>
          <div className="brand-mark" style={{ color: '#fff' }}><DatabaseOutlined /></div>
          <Typography.Title level={3} style={{ margin: 0 }}>StockYard</Typography.Title>
        </Space>
        <Typography.Paragraph type="secondary">
          Procurement to stock, with traceability and replenishment, on one ledger.
        </Typography.Paragraph>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
        <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} initialValues={{ password: 'demo' }}>
          <Form.Item name="username" label="Username" rules={[{ required: true, message: 'Enter a username' }]}>
            <Input prefix={<UserOutlined />} placeholder="e.g. storekeeper" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter the password' }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large">Sign in</Button>
        </Form>
        <Divider plain>or pick a demo role (password: demo)</Divider>
        <List
          size="small"
          dataSource={DEMO_USERS}
          renderItem={(u) => (
            <List.Item
              style={{ cursor: 'pointer' }}
              onClick={() => submit({ username: u.username, password: 'demo' })}
              actions={[<Typography.Text key="p" code>{ROLE_PERMISSIONS[u.role][0]}</Typography.Text>]}
            >
              <List.Item.Meta
                title={`${ROLE_LABEL[u.role]} · ${u.name}`}
                description={ROLE_BLURB[u.role]}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}
