# MODULE 06: Universal Cart & Checkout

## 1. System Overview

Cart & Checkout operates as the ecosystem's agnostic staging area for transactional data. It has no concept of "products" specifically — the same cart can hold a course seat, an event ticket, or a physical item, entirely through the same polymorphic `entity_type`/`entity_id` pattern first established in Module 03's Media Vault.

This module's scope is deliberately narrow. It does not verify stock availability (that belongs to Module 08's Catalog & Inventory), it does not process payment (that belongs to Module 07's Payment Gateway), and it does not handle recurring or subscription billing (that belongs to Module 12). Its entire job is to let a user assemble a cart, and to convert that cart into a durable, atomic order the moment they check out — nothing more, nothing less. The "universal" promise of this ecosystem isn't that any single module does everything for every platform; it's that each module stays this narrow, and the platform is assembled from many of them.

Every cart item **snapshots** its name, price, and currency at the moment it's added, rather than looking these up live. This means a cart's contents remain stable even if a price changes elsewhere before checkout, and it means this module functions correctly on its own even though Module 08 doesn't exist yet.

## 2. Core Capabilities

- **Polymorphic Cart Items:** Any resource type can be added to a cart without this module needing to understand that resource's schema.
- **Idempotent-Friendly Additions:** Adding the same item twice increases its quantity on the existing row rather than creating a duplicate, enforced by a database-level `UNIQUE` constraint, not just application logic.
- **Multi-Currency Aware:** Each cart item carries its own ISO 4217 currency code. Zero-price items (free trials, promotional items) are explicitly supported.
- **Currency-Consistent Checkout:** A single order cannot span multiple currencies — a cart containing mixed currencies is rejected at checkout with a clear error, rather than producing a total that silently conflates incompatible values.
- **Transactional Checkout:** Converting a cart into an order involves several coordinated writes (create the order, snapshot every item, clear the cart). These are wrapped in a real database transaction — if any step fails, all of them roll back, leaving no partial or inconsistent state.
- **Guarded Order Lifecycle:** A `pending_payment` order can be self-service cancelled; an already-cancelled or paid order cannot be cancelled again, enforced at the application layer since no single database constraint could express that rule.
- **Read-Only Admin Visibility:** Users with the `admin` role can view any user's orders, but cannot modify them — a deliberate scope boundary, not an oversight.

## 3. Technology Stack

- **Runtime Environment:** Node.js
- **Web Framework:** Express.js
- **Relational Database:** PostgreSQL (interfaced via the `pg` library)
- **Authentication Core:** jsonwebtoken (JWT), verifying tokens issued by Module 01
- **Environment Management:** dotenv

## 4. Development & Testing Environment

- **Terminal Operations:** Git Bash was used for process execution and environment variable injection.
- **API Testing & Verification:** Bruno (VS Code extension) was used to verify cart mutation logic, transactional integrity under failure conditions, and role-based access to admin routes.
- **Database Hosting:** PostgreSQL hosted on Railway, shared across modules via strictly isolated tables, with genuine foreign keys used only within this module's own tables (`order_items` → `orders`), never across service boundaries.

## 5. Architecture & Data Flow

<table width="100%">
  <tr>
    <td width="60%" valign="top">
      <h2>Part 1: Add-to-Cart Pipeline</h2>
      <p>
        Every mutation first passes <strong>Token Verification</strong>. Field validation then checks not just presence, but real business rules — a non-negative price, a positive quantity, and a properly formatted currency code.
      </p>
      <p>
        The final write relies on the table's own <code>UNIQUE</code> constraint: adding an item already in the cart increases its quantity through an <code>ON CONFLICT</code> clause, rather than requiring the application to check for an existing row itself.
      </p>
    </td>
    <td width="40%" valign="top" align="center">
      <img src="./docs/Fig1.png" alt="Add-to-Cart Pipeline Diagram" width="100%" />
      <br><br>
      <i><strong>Fig 1:</strong> Authentication, business-rule validation, and idempotent persistence.</i>
    </td>
  </tr>
</table>

<br>

<table width="100%">
  <tr>
    <td width="60%" valign="top">
      <h2>Part 2: Transactional Checkout & Order Lifecycle</h2>
      <p>
        Checkout opens a database transaction before touching any data. An empty cart, or a cart spanning multiple currencies, is rejected with an explicit rollback before any write occurs.
      </p>
      <p>
        Only once every write — the order, every order item, and the cart's clearing — has succeeded does the transaction commit. A failure at any point rolls back the entire operation, guaranteeing an order is never left half-created.
      </p>
      <p>
        Beyond creation, an order's lifecycle is guarded explicitly: only a <code>pending_payment</code> order may be cancelled, and admin visibility is read-only by design.
      </p>
    </td>
    <td width="40%" valign="top" align="center">
      <img src="./docs/Fig2.png" alt="Transactional Checkout Diagram" width="100%" />
      <br><br>
      <i><strong>Fig 2:</strong> Atomic checkout and guarded order state transitions.</i>
    </td>
  </tr>
</table>

## 6. Database Schema & Architecture

**Table Structure: `cart_items`**

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | Unique identifier for the cart row. |
| `user_id` | INTEGER | NOT NULL | Sourced from a verified JWT, never from client input. |
| `entity_type` | VARCHAR(50) | NOT NULL | Polymorphic tag identifying the kind of resource in the cart. |
| `entity_id` | VARCHAR(100) | NOT NULL | Polymorphic tag identifying the specific resource instance. |
| `item_name` | VARCHAR(255) | NOT NULL | Snapshotted at add-to-cart time. |
| `unit_price` | DECIMAL(10,2) | NOT NULL | Snapshotted; zero is a valid, supported value. |
| `currency` | VARCHAR(3) | DEFAULT 'INR' | ISO 4217 currency code. |
| `quantity` | INTEGER | DEFAULT 1, CHECK (quantity > 0) | Enforced positive at the database level, not just the application. |
| `added_at` / `updated_at` | TIMESTAMP | DEFAULT NOW() | Standard timestamps. |

`UNIQUE (user_id, entity_type, entity_id)` — the same combination cannot appear twice for one user; a repeat add increases quantity instead.

**Table Structure: `orders`**

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | Unique identifier for the order. |
| `user_id` | INTEGER | NOT NULL | The purchasing user. |
| `status` | VARCHAR(20) | DEFAULT 'pending_payment' | `pending_payment`, `paid`, or `cancelled`. |
| `total` | DECIMAL(10,2) | NOT NULL | Computed once at checkout time. |
| `currency` | VARCHAR(3) | NOT NULL | The single currency this order was placed in. |
| `created_at` / `updated_at` | TIMESTAMP | DEFAULT NOW() | Standard timestamps. |

**Table Structure: `order_items`**

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | Unique identifier for the line item. |
| `order_id` | INTEGER | REFERENCES orders(id) ON DELETE CASCADE | A genuine foreign key — valid here since both tables belong to this same service. |
| `entity_type` / `entity_id` | VARCHAR | NOT NULL | Carried over from the originating cart item. |
| `item_name` / `unit_price` / `currency` / `quantity` | — | NOT NULL | A permanent snapshot of what was actually purchased. |

## 7. Setup & Installation Sequence

**Step 1: Environment Variable Configuration**

```text
PORT=5005
DATABASE_URL=postgresql://[user]:[password]@[host]:[port]/[database]
JWT_SECRET=[must exactly match Module 01's JWT_SECRET]
```

**Step 2: Dependency Installation**
```bash
npm install
```

**Step 3: Database Schema**

Execute the `cart_items`, `orders`, and `order_items` table definitions (Section 6) before first boot.

**Step 4: Engine Initialization**
```bash
node src/server.js
```
*Expected Output:* Console confirms the server is listening on port `5005`.

## 8. API Interface Contract

### 8.1 Public Routes
- **`GET /health`** — Confirms the service is running and can reach the database.

### 8.2 Cart Routes (require `Authorization: Bearer <token>`)
- **`POST /api/cart`** — Adds an item, or increases quantity if it already exists. `400` on invalid fields.
- **`GET /api/cart`** — Returns all items, a computed total, and the distinct currencies present.
- **`PATCH /api/cart/:id`** — Updates quantity. `404` if not found or not owned by the requester.
- **`DELETE /api/cart/:id`** — Removes an item. `404` if not found or not owned by the requester.
- **`POST /api/cart/checkout`** — Converts the cart into an order. `400` if empty or currency-mixed.

### 8.3 Order Routes (require `Authorization: Bearer <token>`)
- **`GET /api/orders`** — Lists the authenticated user's orders.
- **`GET /api/orders/:id`** — Retrieves one order's full detail. `404` if not found or not owned.
- **`PATCH /api/orders/:id/cancel`** — Cancels a `pending_payment` order. `409` if already resolved.

### 8.4 Admin-Only Routes
- **`GET /api/orders/admin/all`** — Lists every order across every user. `403` if not an admin.
- **`GET /api/orders/admin/:id`** — Retrieves any order's full detail, regardless of owner. `403` if not an admin.

## 9. Known Limitations & Roadmap

- **No stock or availability check at checkout.** Module 08 (Catalog & Inventory) doesn't exist yet in this project's build order; this module trusts that whatever's added to a cart is available.
- **Orders remain `pending_payment` indefinitely.** Advancing an order to `paid` is Module 07's responsibility — this module deliberately doesn't simulate or shortcut that.
- **Admin access is read-only.** Admins can view any order but cannot cancel or modify one on a user's behalf.
- **No cross-currency checkout.** A cart spanning multiple currencies must be resolved by the client (e.g. remove or checkout items separately) rather than being automatically converted.
- **Gateway integration pending.** Module 02's reverse proxy does not yet route to this service.
- **Subscriptions are explicitly out of scope.** Recurring billing belongs to Module 12, not this one.

## 10. Testing Guide: Running the Full Ecosystem

This module depends on Module 01 for token issuance.

**Step 1:** Boot Module 01 (`port 5001`) and this module (`port 5005`).

**Step 2:** Obtain a token via `POST http://localhost:5001/api/auth/login`.

**Step 3:** Add items via `POST /api/cart`, review with `GET /api/cart`, then checkout via `POST /api/cart/checkout`.

**Step 4:** Review order history via `GET /api/orders`, and test cancellation via `PATCH /api/orders/:id/cancel`.

**Step 5:** Admin routes require a token belonging to a user whose `role` is `admin` — promote a test user directly via SQL if a dedicated promotion endpoint isn't available.