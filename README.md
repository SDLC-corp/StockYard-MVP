<div align="center">

<img src="public/favicon.svg" width="80" alt="StockYard inventory management system logo" />

# StockYard: Open-Source Inventory Management System & Stock Control Software

**Procurement to stock, on one ledger.** An **inventory management system** that follows every unit from **purchase order** to **goods receipt** to **stock ledger**, with **lot and serial traceability**, **warehouse transfers**, **replenishment planning** and a full **audit trail**.

StockYard is a **procure-to-stock** platform for storekeepers, procurement teams, approvers and administrators. It runs a **four-bucket stock ledger** (on hand, reserved, blocked, in transit), **batch and expiry tracking**, **serial number tracking** with maintenance history, **multi-warehouse inventory**, a single **approval workflow**, **weighted average costing** and **role-based access control**. This MVP runs entirely in the browser, so it needs **no server, no database and no sign-up**.

[![Live demo](https://img.shields.io/badge/live%20demo-open-1f6feb)](https://sdlc-corp.github.io/StockYard-MVP/)
[![CI](https://github.com/SDLC-corp/StockYard-MVP/actions/workflows/ci.yml/badge.svg)](https://github.com/SDLC-corp/StockYard-MVP/actions/workflows/ci.yml)
[![Tests: 12 passing](https://img.shields.io/badge/tests-12%20passing-0f9d58)](src/domain/services.test.ts)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.json)
[![React 18](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=black)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-ff69b4)](#contributing)

[Live demo](https://sdlc-corp.github.io/StockYard-MVP/) · [Quick start](#quick-start) · [Features](#features) · [Screenshots](#screenshots) · [Demo](#5-minute-guided-demo) · [Architecture](#architecture) · [FAQ](#faq) · [Product page](https://sdlccorp.com/products/stockyard/)

<br/>

<img src="docs/screenshots/dashboard.png" width="900" alt="StockYard inventory management dashboard showing items on hand, items below reorder point, awaiting receipts, near-expiry lots, movement statistics and pending approvals" />

</div>

---

## Table of contents

- [Why StockYard?](#why-stockyard)
- [Try it in one click](#try-it-in-one-click)
- [Features](#features)
- [Screenshots](#screenshots)
- [How the procure-to-stock workflow works](#how-the-procure-to-stock-workflow-works)
- [Stock ledger rules](#stock-ledger-rules)
- [Quick start](#quick-start)
- [Demo personas and role-based access](#demo-personas-and-role-based-access)
- [5-minute guided demo](#5-minute-guided-demo)
- [Who is it for?](#who-is-it-for)
- [Architecture](#architecture)
- [Testing](#testing)
- [Deploy to GitHub Pages](#deploy-to-github-pages)
- [MVP vs. the full platform](#mvp-vs-the-full-platform)
- [FAQ](#faq)
- [Glossary](#glossary)
- [Contributing](#contributing)
- [License](#license)

## Why StockYard?

In many operations, **purchasing**, **receiving**, **stores** and **finance** each keep their own records. A purchase order lives in one tool, deliveries are logged on paper, stock counts sit in a spreadsheet, and nobody can say which supplier batch went to which work order. Stock "disappears", expired material gets issued, and audits take weeks.

StockYard puts every step on **one ledger**:

- A **purchase order** can't be sent until it is **approved**, and it can't be received until the delivery is logged at the **gate**.
- **Inspection** splits accepted from rejected quantity, and **rejected stock never enters inventory**.
- Every **issue, return, reservation, block, transfer and adjustment** goes through the **same posting service**, which checks the accounting period, lot expiry, serial state and available quantity before writing anything.
- **Lots and serials** keep their full history, so you can trace a unit from **supplier batch to department or work order**.
- **Replenishment** is calculated from live available stock plus open purchase orders, never from a stale report.

It is also easy to inspect and extend:

- **Correct by construction.** Available quantity is derived, never stored. The ledger is immutable, and corrections are reversals.
- **Specific errors.** Messages name the item, location, lot, and the requested and available quantities.
- **Readable domain code.** The business rules live in plain TypeScript with no framework dependencies, covered by unit tests.

## Try it in one click

Each link opens the **[live demo](https://sdlc-corp.github.io/StockYard-MVP/)** already signed in as that role.

| Role | What they do | Open demo |
|---|---|---|
| 🧰 **Storekeeper** | Receives deliveries, issues & returns material, reservations, transfers, stock counts | [Open as Storekeeper →](https://sdlc-corp.github.io/StockYard-MVP/?as=storekeeper#/) |
| 🛒 **Procurement** | Raises purchase orders and tracks them to full receipt | [Open as Procurement →](https://sdlc-corp.github.io/StockYard-MVP/?as=procurement#/acquisition/purchase-orders) |
| ✅ **Approver** | Works one queue of POs and stock adjustments | [Open as Approver →](https://sdlc-corp.github.io/StockYard-MVP/?as=approver#/approvals) |
| ⚙️ **Administrator** | Masters, accounting periods, reconciliation, audit | [Open as Administrator →](https://sdlc-corp.github.io/StockYard-MVP/?as=admin#/administration) |

You can also sign in with the username `storekeeper`, `procurement`, `approver` or `admin` and the password **`demo`**.

## Features

### Purchase order management
- Multi-line **purchase orders** with supplier, delivery warehouse, expected date and order value
- Lifecycle: **draft → pending approval → approved → sent → partially received → received**
- Receipt progress per line, with accepted and rejected quantities and the approval history
- Cancellation rules: a PO with posted receipts cannot be cancelled

### Goods receiving (gate entry, inspection & GRN)
- **Gate entry** logs the vehicle and driver before anything counts as received
- **Inspection** splits received quantity into **accepted** and **rejected**, with a required reject reason
- **Goods receipt note (GRN)** captures the **supplier lot number and expiry**, or **serial numbers** for each unit
- **Partial deliveries** are supported, and only accepted quantity is posted to stock
- **Weighted average cost** is recalculated on every receipt

### Inventory control & stock operations
- **Issue** to a department or work order, and **return** from it
- **Reserve** stock for planned work and **release** reservations
- **Block** stock for quality hold, damage or maintenance, then **unblock** it
- **Scrap** unusable stock, and submit **count adjustments** that post only after approval
- Searchable **dependent selects** (item → location → lot → serial) that show live available quantity

### Stock ledger & reconciliation
- **16 stock transaction types**, each row showing its bucket deltas, unit cost, reference and user
- **One-time reversals** with a required reason; the original row is kept and marked as reversed
- **Ledger reconciliation** rebuilds balances from the ledger, reports drift and can rebuild the cached values

### Lot, batch & expiry tracking
- **Lot registry** with expiry dates and **near-expiry** warnings (30 days)
- **Expired lots are refused** for issue, reservation and transfer
- An **expiry sweep** job moves remaining expired stock into `BLOCKED`

### Serial number tracking & asset maintenance
- One state per unit: **available, reserved, issued, in transit, under maintenance, damaged or scrapped**
- **Movement history** is written at posting time, not reconstructed later
- **Maintenance and service records** stay with the serial across transfers

### Multi-warehouse inventory & transfers
- Balances per **item × location × lot** across any number of **warehouses**
- **Direct transfers**, or **in-transit transfers** with separate dispatch and receipt steps
- In-transit stock is counted only as `IN_TRANSIT`, so it can never appear in two sites at once

### Replenishment & reorder planning
- **Safety stock**, **reorder point** and **reorder quantity** per item
- **Projected stock** = available + open PO quantity
- **30-day demand history**, **days of cover**, and status **OK / REORDER / CRITICAL**
- A **suggested order quantity**, and a **one-click draft purchase order** from the selected items

### Approvals, audit & governance
- **One approval engine** for purchase orders and stock adjustments, with a single queue
- **Segregation of duties**: requesters cannot approve their own requests, and rejections require remarks
- **Audit trail** of changes, postings, reversals, cost updates and period changes, with **old and new values**
- **Accounting periods**: postings dated in a **closed month** are refused
- **Role-based access control**, checked inside the service on every write

### Dashboard & usability
- KPI tiles, **inbound and outbound movement value** chart, pending approvals, replenishment alerts, latest postings
- **Responsive** layout for phones and tablets, plus **dark mode** that follows the operating system
- Plain-language explanations when an action is unavailable

## Screenshots

<table>
  <tr>
    <td width="50%"><b>Current stock by item, location and lot</b><br/><img src="docs/screenshots/current-stock.png" alt="Current stock screen with inventory balances by item, warehouse location and lot, including reserved, blocked and in-transit quantities and a ledger bucket breakdown" /></td>
    <td width="50%"><b>Purchase order management</b><br/><img src="docs/screenshots/purchase-orders.png" alt="Purchase order list with draft, pending approval, sent and received statuses, supplier, delivery warehouse and order value" /></td>
  </tr>
  <tr>
    <td><b>Gate entry and goods receipt (GRN)</b><br/><img src="docs/screenshots/goods-receipts.png" alt="Goods receipt screen with purchase orders awaiting delivery, vehicles at the gate and posted goods receipt notes" /></td>
    <td><b>Stock issues, returns, reservations and adjustments</b><br/><img src="docs/screenshots/stock-operations.png" alt="Stock operations form for issue, return, reserve, release, block, unblock, scrap and adjustment, with recent inventory transactions" /></td>
  </tr>
  <tr>
    <td><b>Immutable stock ledger with reversals</b><br/><img src="docs/screenshots/stock-ledger.png" alt="Stock ledger listing transaction types with bucket deltas for on hand, reserved, blocked and in transit, unit cost and references" /></td>
    <td><b>Serial number tracking and maintenance history</b><br/><img src="docs/screenshots/serial-history.png" alt="Serial number traceability panel showing unit state, movement history and service records for a torque wrench under maintenance" /></td>
  </tr>
  <tr>
    <td><b>Approval workflow</b><br/><img src="docs/screenshots/approvals.png" alt="Approval queue for purchase orders and stock adjustments with approve and reject decisions" /></td>
    <td><b>Replenishment and reorder point planning</b><br/><img src="docs/screenshots/replenishment.png" alt="Replenishment planner with available, on order and projected stock, demand history, days of cover and suggested order quantity" /></td>
  </tr>
  <tr>
    <td><b>Warehouse transfers (direct and in transit)</b><br/><img src="docs/screenshots/transfers.png" alt="Warehouse stock transfer screen with in-transit dispatch and receipt between locations" /></td>
    <td><b>Audit trail with old and new values</b><br/><img src="docs/screenshots/audit-trail.png" alt="Inventory audit trail of postings, approvals, cost updates and period changes filtered by entity and user" /></td>
  </tr>
  <tr>
    <td><b>Administration: periods and ledger reconciliation</b><br/><img src="docs/screenshots/administration.png" alt="Administration screen with ledger reconciliation, accounting periods, expiry sweep job, users and roles" /></td>
    <td><b>Sign in with a demo role</b><br/><img src="docs/screenshots/login.png" alt="StockYard sign-in screen with Storekeeper, Procurement, Approver and Administrator demo roles" /></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/mobile-dashboard.png" width="240" alt="StockYard inventory app dashboard on a mobile phone" />
  &nbsp;&nbsp;&nbsp;
  <img src="docs/screenshots/mobile-stock.png" width="240" alt="StockYard current stock screen on a mobile phone" />
</p>

## How the procure-to-stock workflow works

<p align="center">
  <img src="docs/procure-to-stock-flow.svg" width="900" alt="StockYard procure-to-stock workflow: purchase order, approval, sent to supplier, gate entry, inspection and goods receipt feeding a single posting service that writes a four-bucket stock ledger" />
</p>

1. **Purchase order:** Procurement raises a PO for a supplier and a delivery warehouse.
2. **Approval:** The PO enters the shared approval queue and cannot be sent until it is approved.
3. **Send:** The approved PO goes to the supplier and becomes *awaiting receipt*.
4. **Gate entry:** The storekeeper logs the delivery vehicle before anything counts as received.
5. **Inspection:** Received quantity is split into **accepted** and **rejected**. Rejected quantity never enters stock.
6. **Goods receipt:** Accepted quantity is posted to a location with its lot and expiry or serial numbers, and the **weighted average cost** is updated.
7. **Ledger:** Every other movement (issues, returns, reservations, blocks, transfers, adjustments) goes through the **same posting service** onto the **same ledger**.

## Stock ledger rules

| Rule | How StockYard enforces it |
|---|---|
| **Four buckets** | `ON_HAND`, `RESERVED`, `BLOCKED` and `IN_TRANSIT`, keyed by item × location × lot |
| **Derived availability** | `available = on hand − reserved − blocked`. It is computed, never stored |
| **Single posting service** | [`postStock()`](src/domain/services.ts) handles all 16 transaction types |
| **Atomic writes** | Each call runs as one transaction: the whole document posts, or nothing does |
| **Validation before writing** | Open accounting period, tracking type, lot expiry, serial state, available quantity, non-negative buckets |
| **Idempotency** | A repeated submission with the same key returns the original transaction instead of posting twice |
| **Immutability** | Posted rows are never edited or deleted. Corrections are reversals, and each transaction can be reversed once |
| **Reconciliation** | Rebuilds balances from the ledger, compares them with cached values, and reports or fixes drift |
| **Specific errors** | *"Insufficient available stock for BRG-6205 "Ball bearing 6205-2RS" at MAIN-A01: requested 80 EA, available 75 (on hand 85, reserved 10, blocked 0)."* |

**The 16 transaction types:** `OPENING` · `GRN_RECEIPT` · `ISSUE` · `RETURN` · `RESERVE` · `UNRESERVE` · `BLOCK` · `UNBLOCK` · `ADJUST_IN` · `ADJUST_OUT` · `TRANSFER_OUT` · `TRANSFER_IN` · `TRANSFER_DISPATCH` · `TRANSFER_RECEIVE` · `SCRAP` · `REVERSAL`

## Quick start

Requires **Node.js 18 or later**.

```bash
git clone https://github.com/SDLC-corp/StockYard-MVP.git
cd StockYard-MVP
npm install
npm run dev
```

Then open <http://localhost:5173> and pick a demo role.

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server with hot reload |
| `npm test` | Run the domain unit tests and the UI smoke test |
| `npm run build` | Type-check and build the production site into `dist/` |
| `npm run preview` | Serve the production build locally |

Demo data is created on first load and saved in your browser. **Administration → Reset demo** restores it at any time.

## Demo personas and role-based access

| Persona | Role | Permission | Can do |
|---|---|---|---|
| Sam Patel | Storekeeper | `inventory.post` | Gate entry, goods receipt, issue, return, reserve, block, scrap, transfers, reversals, adjustment requests |
| Priya Nair | Procurement | `acquisition.manage` | Create, submit, send and cancel purchase orders; draft POs from replenishment |
| Alex Morgan | Approver | `approval.act` | Approve or reject purchase orders and stock adjustments |
| Jordan Lee | Administrator | `admin.manage` | Items, suppliers, locations, accounting periods, reconciliation, expiry sweep |

Permissions are checked **inside the service on every write**, not only by hiding buttons. Switch roles from the menu at the top right and try an action you are not allowed to take: the service refuses it with a clear "Permission denied" message.

## 5-minute guided demo

1. **[As Approver](https://sdlc-corp.github.io/StockYard-MVP/?as=approver#/approvals):** approve **PO-00002** (SafeGuard PPE).
2. **[As Procurement](https://sdlc-corp.github.io/StockYard-MVP/?as=procurement#/acquisition/purchase-orders):** **Send** that PO. Then open **Replenishment**, select the critical items and draft a new PO.
3. **[As Storekeeper](https://sdlc-corp.github.io/StockYard-MVP/?as=storekeeper#/receiving/goods-receipts):** log a **gate entry**, then **Inspect & receive**. Reject a few units and enter a lot and expiry. Check the new average cost in **Current Stock**.
4. **Storekeeper:** in **Stock Issues & Ops**, try to issue more than is available and read the error. Then try to issue from the expired lot **BUF-0921**.
5. **Storekeeper:** in **Transfers**, **receive** the in-transit hydraulic oil and watch `IN_TRANSIT` become `ON_HAND`.
6. **[As Administrator](https://sdlc-corp.github.io/StockYard-MVP/?as=admin#/administration):** click **Simulate drift**, run **reconciliation** and rebuild. Then close the current month and confirm that postings are refused.
7. **Anyone:** open **Audit Trail** to see every change with its old and new values.

## Who is it for?

| Industry | How StockYard helps |
|---|---|
| **Manufacturing & spare parts** | Issues against work orders, lot traceability back to supplier batches, reservations for planned maintenance |
| **Distribution & 3PL** | Multi-warehouse balances, in-transit transfers, demand-based reorder points |
| **Field service & asset management** | Serialised equipment with state, location and maintenance history |
| **Healthcare, pharma & lab supplies** | Batch and expiry control, with expired stock blocked automatically |
| **Campus & facilities management** | Departmental requisitions and issues that can be traced to who used what |
| **Regulated & public-sector procurement** | Defensible approval trails, closed accounting periods and a full audit log |

## Architecture

| Layer | Technology |
|---|---|
| UI | React 18, TypeScript (strict), Ant Design 5, Recharts, React Router (hash routing) |
| Domain logic | Framework-free TypeScript: posting service, approval engine, PO, GRN, transfer and admin services |
| Persistence (MVP) | Transactional in-browser store (clone → mutate → commit), saved to `localStorage` |
| Build & test | Vite 5, Vitest, Testing Library |
| CI/CD | GitHub Actions (CI + GitHub Pages deployment) |

```
src/
├─ domain/              # business rules, no React; ready to move behind a REST API
│  ├─ types.ts          # shared contracts: enums, entities, 16 transaction types
│  ├─ services.ts       # posting service, approval engine, PO / GRN / transfer / admin services
│  ├─ store.ts          # atomic transactional store + persistence
│  ├─ seed.ts           # demo dataset, created through the real services
│  └─ api.ts            # session + one-transaction-per-call API used by the UI
├─ components/          # searchable dependent selects, status tags, action runner
└─ pages/               # one file per screen (14 screens)
docs/                   # screenshots and diagrams used in this README
.github/workflows/      # ci.yml (tests + build), deploy.yml (GitHub Pages)
```

Every write follows the same path: **UI → `api` (session and transaction) → domain service (permission check and validation) → `postStock` → ledger + balances + audit trail**. If any step throws, the transaction is discarded and nothing changes.

## Testing

```bash
npm test
```

| Suite | Covers |
|---|---|
| [`services.test.ts`](src/domain/services.test.ts) | The seed ledger reconciles; issues above availability are refused with a specific message; idempotent re-submission; reverse-once; expired-lot blocking and expiry sweep; closed periods; server-side permissions; serial state machine; PO → gate entry → GRN with rejection and average-cost update; no self-approval; in-transit transfers |
| [`app.smoke.test.tsx`](src/app.smoke.test.tsx) | Renders the sign-in screen and every route for each role, and fails on any runtime error or React warning |

CI runs the tests and a production build on every push and pull request.

## Deploy to GitHub Pages

1. Fork or push this repository to GitHub.
2. Open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. Push to `main`. [`deploy.yml`](.github/workflows/deploy.yml) builds the site and publishes it to `https://<account>.github.io/<repository>/`.

The build uses a relative base path and hash routing, so it works under any repository name without configuration.

## MVP vs. the full platform

| Capability | This MVP | Full StockYard platform |
|---|:---:|:---:|
| Purchase orders, approvals, gate entry, goods receipts | ✅ | ✅ |
| Four-bucket stock ledger, 16 transaction types, reversals | ✅ | ✅ |
| Lot & expiry tracking, serial tracking, maintenance records | ✅ | ✅ |
| Transfers, replenishment, audit trail, periods, reconciliation | ✅ | ✅ |
| Requirements, requisitions, RFQs, quotation comparison, split awards | - | ✅ |
| Budgets and commitments, supplier invoices, payments | - | ✅ |
| Forecast rules, maintenance alerts, full report suite | - | ✅ |
| Node.js/Express API, PostgreSQL with Prisma, JWT auth | - | ✅ |
| Multi-user, shared data, cloud or on-premise deployment | - | ✅ |
| Scale | 14 screens | 94 entities · 314 REST endpoints · 65 screens |

For the full platform, see the [StockYard product page](https://sdlccorp.com/products/stockyard/) or email **sales@sdlccorp.com**.

## FAQ

<details open>
<summary><b>What is StockYard?</b></summary>

StockYard is an inventory management system by SDLC Corp that covers procurement through to stock: purchase orders, approvals, gate entry, goods receipts, a four-bucket stock ledger, lot and serial traceability, warehouse transfers, replenishment planning, accounting periods and an audit trail. This repository is the open-source MVP and live demo.
</details>

<details>
<summary><b>Is StockYard free to try?</b></summary>

Yes. The [live demo](https://sdlc-corp.github.io/StockYard-MVP/) needs no sign-up, and the MVP source code is MIT licensed. Pick a role on the sign-in screen, or use the password `demo`.
</details>

<details>
<summary><b>How does StockYard calculate available stock?</b></summary>

Available quantity is derived as **on hand − reserved − blocked** for each item, location and lot. It is never stored, so it cannot drift from the ledger. In-transit stock is tracked in a separate bucket and counts as on hand only once it is received.
</details>

<details>
<summary><b>Does StockYard support batch, lot and expiry tracking?</b></summary>

Yes. Lot-tracked items require a lot on every movement, and expiry is captured at goods receipt. Lots within 30 days of expiry are flagged, and expired lots are refused for issue, reservation and transfer. An expiry sweep moves the remaining expired stock into `BLOCKED`.
</details>

<details>
<summary><b>Does StockYard support serial number tracking?</b></summary>

Yes. Each serialised unit has exactly one state at a time (available, reserved, issued, in transit, under maintenance, damaged or scrapped). Every posting writes the unit's movement history, and maintenance and service records stay with the serial across transfers.
</details>

<details>
<summary><b>How are mistakes corrected if the ledger is immutable?</b></summary>

By **reversal**. A reversal posts equal and opposite bucket movements and links back to the original transaction. Each transaction can be reversed only once, and both rows stay in the ledger and the audit trail.
</details>

<details>
<summary><b>What inventory costing method does StockYard use?</b></summary>

**Weighted average cost**, recalculated on every goods receipt from the current on-hand quantity and the receipt's unit price. Each cost change is recorded in the audit trail with its old and new values.
</details>

<details>
<summary><b>Can StockYard manage multiple warehouses?</b></summary>

Yes. Balances are kept per item, location and lot across any number of warehouses. Transfers can be direct, or in transit with separate dispatch and receipt steps, so stock is never counted in two sites at once.
</details>

<details>
<summary><b>Where is data stored in the demo?</b></summary>

In your browser's `localStorage`, so each visitor has a private copy that nobody else can see. The full StockYard platform uses PostgreSQL and runs in managed cloud, your own cloud tenancy, or fully on-premise.
</details>

<details>
<summary><b>How do I get StockYard for my business?</b></summary>

Contact SDLC Corp at **sales@sdlccorp.com** or visit the [StockYard product page](https://sdlccorp.com/products/stockyard/). Pricing depends on deployment model, modules, number of sites and users, and can be phased.
</details>

## Glossary

| Term | Meaning |
|---|---|
| **GRN (goods receipt note)** | The document that posts accepted delivered quantity into stock |
| **Gate entry** | A record that a supplier delivery arrived, logged before inspection |
| **On hand** | Physical quantity at a location |
| **Reserved** | Quantity held for a work order or other demand, not available to anyone else |
| **Blocked** | Quantity on quality hold, under maintenance or expired |
| **In transit** | Quantity dispatched between locations and not yet received |
| **Safety stock** | Buffer quantity held against demand variability |
| **Reorder point (ROP)** | The projected stock level at which a replenishment order should be raised |
| **Days of cover** | Available stock ÷ average daily demand |
| **Weighted average cost** | Unit cost blended across all receipts, weighted by quantity |

## Contributing

Contributions are welcome.

1. Fork the repository and create a branch: `git checkout -b feature/my-change`.
2. Keep business rules in `src/domain` and add or update tests in `src/domain/services.test.ts`.
3. Run `npm test` and `npm run build`, and make sure both pass.
4. Open a pull request that describes the change and how you tested it.

Bug reports and feature ideas are welcome in [Issues](https://github.com/SDLC-corp/StockYard-MVP/issues).

## License

Released under the [MIT License](LICENSE). © 2026 SDLC Corp.

---

<div align="center">

**StockYard** is a product of [SDLC Corp](https://sdlccorp.com/products/stockyard/).
For a scoped proposal or a demo of the full platform, email [sales@sdlccorp.com](mailto:sales@sdlccorp.com).

<sub>Keywords: inventory management system · stock management software · warehouse management · inventory control · procure to stock · purchase order management · goods receipt note (GRN) · stock ledger · lot tracking · batch and expiry tracking · serial number tracking · asset tracking · multi-warehouse inventory · stock transfer · reorder point · safety stock · replenishment planning · approval workflow · audit trail · weighted average cost · React · TypeScript · Ant Design</sub>

</div>
