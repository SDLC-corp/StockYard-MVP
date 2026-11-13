# StockYard: Inventory Management MVP

StockYard covers procurement through to stock, with traceability and replenishment, and keeps every item, lot and serial on one stock ledger.

This repository is a **deployable MVP / live demo** of [StockYard by SDLC Corp](https://sdlccorp.com/products/stockyard/). It runs entirely in the browser, so it can be hosted for free on **GitHub Pages**. There is no server or database to provision.

> **Demo login:** choose any role on the sign-in screen, or use the username `storekeeper`, `procurement`, `approver` or `admin` with the password `demo`. You can switch roles at any time from the menu at the top right.

---

## What's in the MVP

| Area | What you can do |
|---|---|
| **Dashboard** | KPI tiles, inbound/outbound movement chart, pending approvals, replenishment alerts, latest postings |
| **Masters** | Items (tracking type, UoM, safety stock, reorder point), suppliers, warehouses & locations, departments |
| **Purchase orders** | Create multi-line POs → submit → approve → send to supplier. Includes progress and approval history |
| **Receiving** | Gate entry → inspection → goods receipt. Accepted and rejected quantities are split, lot/expiry or serial numbers are captured, and only accepted quantity is posted |
| **Current stock** | Summary tiles, searchable balances by item/location/lot, and a four-bucket breakdown per item |
| **Stock operations** | Issue, return, reserve, release, block, unblock and scrap, plus count adjustments that are routed through approval |
| **Stock ledger** | All 16 transaction types, bucket deltas, and one-time reversals with a reason |
| **Lots & serials** | Lot registry with expiry status. Each serial has a state machine, movement history and service records |
| **Transfers** | Direct, or in-transit (dispatch → receive), where stock is counted only in IN_TRANSIT until it arrives |
| **Replenishment** | Projected stock (available + on order), demand history, days of cover, suggested quantity, and one-click draft PO |
| **Approvals** | One engine and one queue for POs and adjustments. Rejections require remarks, and requesters cannot approve their own requests |
| **Audit trail** | Changes, postings, reversals, cost updates and period changes, with old and new values |
| **Administration** | Accounting periods (closed months block postings), ledger reconciliation with a drift simulation, expiry sweep job, users & roles, demo reset |

### Ledger rules implemented

- **Four buckets** per item × location × lot: `ON_HAND`, `RESERVED`, `BLOCKED`, `IN_TRANSIT`. **Available is derived** as on hand − reserved − blocked and is never stored.
- **A single posting service** ([`src/domain/services.ts`](src/domain/services.ts) → `postStock`) handles every movement. It is atomic: the whole write is committed or none of it. It validates the accounting period, tracking type, lot expiry, serial state and available quantity before writing.
- **Idempotency keys:** a repeated submission returns the original transaction.
- **Immutable ledger:** rows are never edited. Corrections are made by reversal, and each transaction can be reversed only once.
- **Weighted average cost** is recalculated on goods receipt.
- **Reconciliation** rebuilds balances from the ledger and reports or fixes drift.
- **Permissions are checked inside the service on every write** (`inventory.post`, `acquisition.manage`, `approval.act`, `admin.manage`). Hiding a button is not the access control.
- **Specific error messages** name the item, location, lot, requested and available quantities.

## Tech stack

React 18 · TypeScript (strict) · Vite · Ant Design 5 · Recharts · React Router (hash routing for Pages) · Vitest

```
src/
  domain/        # framework-free business logic (shared contracts + services)
    types.ts     # enums, entities, 16 transaction types
    services.ts  # posting service, approval engine, PO/GRN/transfer/admin services
    store.ts     # transactional store (clone → mutate → commit), localStorage persistence
    seed.ts      # demo dataset, built through the real services
    api.ts       # session + the app's "API" (one transaction per call)
  components/    # shared UI (searchable dependent selects, status tags, runners)
  pages/         # one file per screen
```

The `domain/` layer has no React dependency. It is designed to move behind an Express + PostgreSQL/Prisma API (the production StockYard architecture) without changing the business rules.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # domain unit tests + UI smoke test
npm run build      # production build in dist/
```

Requires Node 18+.

## Deploy to GitHub Pages

1. Create a new GitHub repository and push this project to its `main` branch:
   ```bash
   git init
   git add .
   git commit -m "StockYard MVP"
   git branch -M main
   git remote add origin https://github.com/<your-account>/<repo-name>.git
   git push -u origin main
   ```
2. On GitHub, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. The workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) installs dependencies, runs the tests, builds the app and publishes it. The site is served at `https://<your-account>.github.io/<repo-name>/`.

The build uses a relative base path and hash routing, so it works under any repository name with no extra configuration.

## Demo walkthrough (5 minutes)

1. **Approver:** open *Approvals* and approve PO-00002 (SafeGuard PPE).
2. **Procurement:** open *Purchase Orders* and **Send** that PO. Then, in *Replenishment*, select the critical items and draft another PO.
3. **Storekeeper:** in *Goods Receipts*, log a gate entry, then **Inspect & receive**. Reject a few units and enter a lot number and expiry. Check *Current Stock* and the new average cost.
4. **Storekeeper:** in *Stock Issues & Ops*, try to issue more than is available and read the specific error. Then try to issue from the expired lot `BUF-0921`.
5. **Storekeeper:** in *Transfers*, receive the in-transit hydraulic oil transfer and watch IN_TRANSIT become ON_HAND.
6. **Admin:** in *Administration*, click **Simulate drift**, then run reconciliation, find the mismatch and rebuild. Close the current period and confirm that postings are refused.
7. **Anyone:** open *Audit Trail* to see every change with old and new values.

## MVP scope and roadmap

This MVP is a client-side demonstration. Data lives in your browser's `localStorage`, and *Administration → Reset demo* restores the seed data. Moving to production means:

- Express + PostgreSQL (Prisma) backend: move `src/domain` behind REST endpoints, use DB transactions and constraints, store quantities and money as `numeric`, add JWT auth with hashed passwords.
- Requirements → requisitions → RFQ → quotation comparison and split awards.
- Budgets and commitments, supplier invoices, payment requests and payment advice.
- Forecast rules, maintenance alerts, and the full report set (expiry, pending transactions, inbound summary).

---

StockYard is a product of SDLC Corp. For a scoped proposal or a demo of the full platform, contact sales@sdlccorp.com.
