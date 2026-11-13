// @vitest-environment jsdom
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter } from 'react-router-dom';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }),
  });
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  window.getComputedStyle = ((orig) => (el: Element) => orig(el))(window.getComputedStyle);
});

const ROUTES = [
  '/', '/masters/items', '/masters/other', '/acquisition/purchase-orders', '/receiving/goods-receipts',
  '/inventory/current-stock', '/inventory/operations', '/inventory/stock-ledger', '/traceability/serials',
  '/transfers', '/planning/replenishment', '/approvals', '/administration/audit-trail', '/administration',
];

describe('UI smoke test', () => {
  it('renders the login screen and every route for every role without crashing', async () => {
    const { default: App } = await import('./App');
    const { session } = await import('./domain/api');
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => {
      const msg = String(a[0]);
      if (!/not wrapped in act|findDOMNode|defaultProps/.test(msg)) errors.push(a);
    });

    session.logout();
    const login = render(<AntApp><MemoryRouter><App /></MemoryRouter></AntApp>);
    expect(login.getByText('Sign in')).toBeTruthy();
    cleanup();

    for (const [username, routes] of [['storekeeper', ROUTES], ['procurement', ['/acquisition/purchase-orders', '/planning/replenishment']], ['approver', ['/approvals']], ['admin', ['/administration', '/masters/items']]] as const) {
      session.login(username, 'demo');
      for (const route of routes) {
        const r = render(<AntApp><MemoryRouter initialEntries={[route]}><App /></MemoryRouter></AntApp>);
        expect(r.container.textContent?.length, `${username} ${route}`).toBeGreaterThan(50);
        cleanup();
      }
    }
    spy.mockRestore();
    expect(errors).toEqual([]);
  }, 120_000);
});
