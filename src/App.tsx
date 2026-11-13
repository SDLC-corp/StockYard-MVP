import { Avatar, Button, Drawer, Dropdown, Grid, Layout, Menu, Space, Tag, Typography } from 'antd';
import {
  AppstoreOutlined, AuditOutlined, BarcodeOutlined, CheckSquareOutlined, DashboardOutlined, DatabaseOutlined,
  ExportOutlined, InboxOutlined, LogoutOutlined, MenuOutlined, SettingOutlined, ShopOutlined, ShoppingCartOutlined,
  SwapOutlined, ThunderboltOutlined, UnorderedListOutlined, UserSwitchOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { session, useDb, useSessionUser } from './domain/api';
import { ROLE_LABEL } from './domain/types';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Items from './pages/Items';
import Masters from './pages/Masters';
import PurchaseOrders from './pages/PurchaseOrders';
import Receiving from './pages/Receiving';
import CurrentStock from './pages/CurrentStock';
import StockLedger from './pages/StockLedger';
import StockOperations from './pages/StockOperations';
import Traceability from './pages/Traceability';
import Transfers from './pages/Transfers';
import Replenishment from './pages/Replenishment';
import Approvals from './pages/Approvals';
import AuditTrail from './pages/AuditTrail';
import Administration from './pages/Administration';

const NAV = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/masters/items', icon: <AppstoreOutlined />, label: 'Items' },
  { key: '/masters/other', icon: <ShopOutlined />, label: 'Suppliers & Locations' },
  { key: '/acquisition/purchase-orders', icon: <ShoppingCartOutlined />, label: 'Purchase Orders' },
  { key: '/receiving/goods-receipts', icon: <InboxOutlined />, label: 'Goods Receipts' },
  { key: '/inventory/current-stock', icon: <DatabaseOutlined />, label: 'Current Stock' },
  { key: '/inventory/operations', icon: <ExportOutlined />, label: 'Stock Issues & Ops' },
  { key: '/inventory/stock-ledger', icon: <UnorderedListOutlined />, label: 'Stock Ledger' },
  { key: '/traceability/serials', icon: <BarcodeOutlined />, label: 'Lots & Serials' },
  { key: '/transfers', icon: <SwapOutlined />, label: 'Transfers' },
  { key: '/planning/replenishment', icon: <ThunderboltOutlined />, label: 'Replenishment' },
  { key: '/approvals', icon: <CheckSquareOutlined />, label: 'Approvals' },
  { key: '/administration/audit-trail', icon: <AuditOutlined />, label: 'Audit Trail' },
  { key: '/administration', icon: <SettingOutlined />, label: 'Administration' },
];

function Shell() {
  const user = useSessionUser()!;
  const db = useDb();
  const nav = useNavigate();
  const loc = useLocation();
  const screens = Grid.useBreakpoint();
  const [open, setOpen] = useState(false);
  const pending = db.approvals.filter((a) => a.status === 'PENDING').length;
  const selected =
    [...NAV]
      .sort((a, b) => b.key.length - a.key.length)
      .find((n) => (n.key === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.key)))?.key ?? '/';

  const menu = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selected]}
      onClick={(e) => {
        nav(e.key);
        setOpen(false);
      }}
      items={NAV.map((n) => ({
        ...n,
        label:
          n.key === '/approvals' && pending ? (
            <Space>
              {n.label}
              <Tag color="gold" style={{ marginInlineEnd: 0 }}>{pending}</Tag>
            </Space>
          ) : (
            n.label
          ),
      }))}
    />
  );
  const brand = (
    <div className="brand">
      <div className="brand-mark"><DatabaseOutlined /></div>
      StockYard
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {screens.lg ? (
        <Layout.Sider width={236}>
          <div style={{ position: 'sticky', top: 0, maxHeight: '100vh', overflowY: 'auto' }}>
            {brand}
            {menu}
          </div>
        </Layout.Sider>
      ) : (
        <Drawer
          placement="left"
          open={open}
          onClose={() => setOpen(false)}
          width={260}
          closable={false}
          styles={{ body: { padding: 0, background: '#001529' } }}
        >
          {brand}
          {menu}
        </Drawer>
      )}
      <Layout>
        <Layout.Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', gap: 12 }}>
          <Space>
            {!screens.lg && (
              <Button type="text" icon={<MenuOutlined style={{ color: '#fff' }} />} onClick={() => setOpen(true)} aria-label="Open menu" />
            )}
            {!screens.lg && <Typography.Text strong style={{ color: '#fff' }}>StockYard</Typography.Text>}
            {screens.md && <Tag color="blue">Demo data · runs in your browser</Tag>}
          </Space>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'h',
                  type: 'group',
                  label: 'Switch demo user',
                  children: db.users.map((u) => ({
                    key: u.id,
                    icon: <UserSwitchOutlined />,
                    label: `${u.name} - ${ROLE_LABEL[u.role]}`,
                    disabled: u.id === user.id,
                  })),
                },
                { type: 'divider' },
                { key: 'logout', icon: <LogoutOutlined />, label: 'Sign out', danger: true },
              ],
              onClick: ({ key }) => {
                if (key === 'logout') return session.logout();
                const u = db.users.find((x) => x.id === key);
                if (u) session.login(u.username, 'demo');
              },
            }}
          >
            <Space style={{ cursor: 'pointer', color: '#fff' }}>
              <Avatar style={{ background: '#1f6feb' }}>{user.name[0]}</Avatar>
              {screens.sm && (
                <span>
                  {user.name} · <span style={{ color: '#9ec1ff' }}>{ROLE_LABEL[user.role]}</span>
                </span>
              )}
            </Space>
          </Dropdown>
        </Layout.Header>
        <Layout.Content>
          <div className="app-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/masters/items" element={<Items />} />
              <Route path="/masters/other" element={<Masters />} />
              <Route path="/acquisition/purchase-orders" element={<PurchaseOrders />} />
              <Route path="/receiving/goods-receipts" element={<Receiving />} />
              <Route path="/inventory/current-stock" element={<CurrentStock />} />
              <Route path="/inventory/operations" element={<StockOperations />} />
              <Route path="/inventory/stock-ledger" element={<StockLedger />} />
              <Route path="/traceability/serials" element={<Traceability />} />
              <Route path="/transfers" element={<Transfers />} />
              <Route path="/planning/replenishment" element={<Replenishment />} />
              <Route path="/approvals" element={<Approvals />} />
              <Route path="/administration/audit-trail" element={<AuditTrail />} />
              <Route path="/administration" element={<Administration />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </Layout.Content>
        <Layout.Footer style={{ textAlign: 'center', fontSize: 12, opacity: 0.7 }}>
          StockYard MVP · procure-to-stock inventory management · demonstration data
        </Layout.Footer>
      </Layout>
    </Layout>
  );
}

export default function App() {
  const user = useSessionUser();
  return user ? <Shell /> : <Login />;
}
