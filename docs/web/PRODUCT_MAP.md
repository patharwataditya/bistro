# Bistro Product Map (web client source of truth)

Derived from code in `backend/app/**` and `android/app/src/main/java/ai/synkrasis/bistro/**`. All paths are under `/api/v1`. Every endpoint except `/auth/login`, `/auth/refresh`, `/auth/revoke`, and `/health` needs `Authorization: Bearer <access>`. Request bodies reject unknown fields (`extra="forbid"`), and strings are trimmed.

## 1. Modules & Android screens

| Screen (file) | Purpose / key actions | Gates (exact permission) | API |
|---|---|---|---|
| Login (`auth/LoginScreen`) | Sign in. `device_label` = "Manufacturer Model" (≤120). | none | `POST /auth/login`, `GET /me` |
| Home (`dashboard/HomeScreen`) | Greeting, stat tiles (Kitchen = new+preparing, Orders = open count, "Bills awaiting payment", sales today), "Recent activity". Tapping Kitchen/Orders tiles switches tab. | tab `dashboard.view`. Tile taps: `kitchen.view` → Kitchen, `tables.view` → Floor. Each section is null server-side without its permission. | `GET /dashboard` |
| Floor (`floor/FloorScreen`, `FloorSheets`) | Area chips + status filter. Tapping a table: if it has an active order → Order; if seatable (AVAILABLE/RESERVED/CLEANING) and the user can seat → "Seat {table}" sheet (guests 1–100, default min(capacity,2), button "Open table"), which opens the order and then pushes Order and then Add items. Otherwise the "Table {name}" sheet sets status ("Save status", note, "Reservation (name, time)" for Reserved). The manage icon goes to Tables & areas. | seat: `orders.create`; status: `tables.manage_status`; manage icon: `tables.update` or `tables.create` | `GET /tables`, `POST /orders` (Idempotency-Key per sheet), `POST /tables/{id}/status` |
| Order (`order/OrderScreen`, `OrderSheets`, `OrderItemRow`) | Sections: "Not sent yet", "Ready to serve", "In the kitchen", "Served", "Voided". Pending lines: qty stepper (debounced 400 ms) and note sheet (quick notes: No onions, Extra spicy, Mild, No nuts, Gluten free, On the side; "Save note" / "Remove item"). Ready lines: Serve. Sent lines: Void (reason). Bottom bar: "Add", "Send to kitchen · n", "Issue bill · total"; when not OPEN: "Take payment" (BILLED) / "View bill". Menu sheet "Check #n": "Change guests", "Move to another table", "Merge a table into this one", "Split items to a new table", "Cancel order". TotalsCard is marked estimate while `bill_id == null`. | edit/add/send/serve/guests: `orders.update` (edit only when OPEN); void: `orders.cancel` + OPEN + item not PENDING/VOIDED; Issue bill: `billing.create` and no pending and ≥1 live item; View/Take payment: `billing.view`; Move: `orders.transfer`; Merge/Split: `orders.transfer` + OPEN; Cancel: OPEN + `orders.update` + (nothing fired or `orders.cancel`) | `GET /orders/{id}`, `PATCH/DELETE /orders/{id}/items/{iid}`, `POST .../void`, `POST .../serve`, `POST /orders/{id}/fire`, `PATCH /orders/{id}`, `POST /orders/{id}/cancel|transfer|merge|split`, `POST /bills`, `GET /tables` (picker) |
| Add items (`order/AddItemsScreen`, `AddItemsViewModel`) | Local cart (line key = item + note, qty ≤999), category chips, client-side search, review sheet "Review n items", add to the check only, or add then send. Discard confirm. Unavailable items can't be added. | reached via `orders.update` | `GET /menu`, `GET /orders/{id}`, `POST /orders/{id}/items`, `POST /orders/{id}/fire` |
| Orders (`order/OrdersScreen`) | Filters: Active (OPEN,BILLED), Closed (CLOSED), Cancelled (CANCELLED,MERGED). | `orders.view` | `GET /orders?status=…&limit=100` |
| Kitchen (`kitchen/*`) | Lanes (see §8). Per-ticket primary and secondary buttons, timers, urgency. Phone shows one lane; ≥600dp shows all lanes. | tab `kitchen.view`; buttons `kitchen.update` | `GET /kitchen/tickets`, `POST /kitchen/tickets/{id}/transition` |
| Bills (`billing/BillsScreen`) | Filters: Open; "Paid today" (PAID, PARTIALLY_REFUNDED, REFUNDED with `paid_since` = local midnight in the location tz); Void. | `billing.view` | `GET /bills?status=…&paid_since=…&limit=200` |
| Bill (`billing/BillScreen`, `BillSheets`, `PaymentSheet`, `BillParts`) | Top bar: Void (danger icon), open check. Bar: "Discount"/"Edit discount", "Refund", "Take payment · balance", "Close bill · nothing to collect". Payment sheet: active methods sorted by (sort_order, name); cash quick tenders = exact amount plus the next 3 round-ups to 10/50/100/500/1000/2000; success state "Paid in full". Screenshots blocked (FLAG_SECURE). | Void: `billing.void` + OPEN + net paid = 0; open check: `orders.view`; Discount: `billing.discount` + OPEN + net paid = 0; Refund: `billing.refund` + (OPEN/PAID/PARTIALLY_REFUNDED) + a method holds money; Pay/Close: `billing.process_payment` | `GET /bills/{id}`, `GET /payment-methods`, `POST /bills/{id}/payments|settle|discount|refunds|void` |
| More (`more/MoreScreen`) | Links (§2), Appearance and "Haptic feedback" (device-local), "Change password" ("Other devices will be signed out."), "Sign out". | per link | `POST /me/password`, `POST /auth/revoke` |
| Menu (`menu/*`) | Items CRUD, price, sold-out toggle, categories sheet. | create `menu.create`, edit `menu.update`, delete `menu.delete`, categories `menu.manage_categories`, availability `menu.set_availability` | `GET /menu`, `POST/PATCH/DELETE /menu/items…`, `POST /menu/items/{id}/availability`, `POST/PATCH/DELETE /menu/categories…` |
| Tables & areas (`floor/TablesManageScreen`) | Table CRUD; add/delete areas. Areas are never renamed from Android. | `tables.create`/`tables.update`/`tables.delete` | `GET /tables`, `POST/PATCH/DELETE /tables…`, `POST/DELETE /table-areas…` |
| Reports (`reports/ReportsScreen`) | Presets: Today, Yesterday, Last 7 days, This month, Last 30 days. Daily chart, "When bills are settled" (hourly), "Payment methods" (net of refunds), "Staff", top items, tables. FLAG_SECURE. | `reports.view` | `GET /reports/summary` |
| Staff (`management/StaffScreen`, `StaffSheets`) | List, "Show deactivated", search, create, change roles, reset password, deactivate/reactivate. FLAG_SECURE. | create `staff.create`; roles `staff.update` + `manageable` + not self; password `staff.update` + `password_resettable`; status `staff.deactivate`; role list loaded only with `roles.view` | `GET /users?include_inactive&limit=200`, `GET /roles`, `POST /users`, `PATCH /users/{id}`, `POST /users/{id}/deactivate|reactivate|password` |
| Roles / Role edit (`RolesScreen`, `RoleEditScreen`) | List with lock icon when `!editable`. Editor groups permissions. A permission toggle is disabled if the actor lacks it ("You can't grant access you don't have"). Delete confirm. | create `roles.create`, edit `roles.update` + `editable`, delete `roles.delete` | `GET /roles`, `GET /permissions`, `POST /roles`, `PATCH/DELETE /roles/{id}` |
| Settings (`SettingsScreen`, `SettingsSections`) | General, billing, tax table, payment methods (add, toggle active/cash). Reloads `/me` after a profile-affecting save. | edit `settings.update`; restaurant name only when the user holds ALL permissions | `GET/PATCH /settings`, `PUT /settings/tax-rates`, `POST/PATCH /payment-methods…` |
| Activity log (`AuditScreen`) | Chips: All, Orders `order.`, Billing `bill.`, Payments `payment.`, Staff `staff.`, Roles `role.`, Menu `menu.`, Settings `settings.`, Tables `table.`. "Load more" paginates by cursor. Detail rows: When/Action/entity. | `audit_logs.view` | `GET /audit-logs?before_id&action` |

Android never calls `GET /users/{id}`, `GET /roles/{id}`, `PATCH /table-areas/{id}`, `GET /table-areas`, or `POST /auth/logout` (it signs out with `/auth/revoke`).

## 2. Navigation

`TopLevel` tabs, in order: Home (`dashboard.view`), Floor (`tables.view`), Kitchen (`kitchen.view`), Bills (`billing.view`), More (always shown). A bottom bar is used under 600dp and a NavigationRail at ≥600dp. Tabs are computed from `/me.permissions`, and `/me` is re-read each time the shell opens.

More links: Orders `orders.view`, Menu `menu.view`, Tables & areas `tables.update`, Reports `reports.view`, Staff `staff.view`, Roles & permissions `roles.view`, Restaurant settings `settings.view`, Audit log `audit_logs.view`.

Pushed routes: `OrderRoute(orderId)`, `AddItemsRoute(orderId)`, `BillRoute(billId)`, `RoleEditRoute(roleId | -1 = new)`.

## 3. API endpoints

Legend: **Idem** = accepts `Idempotency-Key`. **V** = body `version` (optimistic concurrency, 409 STALE_VERSION with `details.current_version`). Money input (`MoneyIn`) is a Decimal with ≤2 dp, 0…9999999999.99 (`PositiveMoneyIn` requires >0), normalised to cents. `Reason` is 3–200 chars. `Name` is 1–60. `ShortText` is ≤200. `Page[T]` = `{items,total,limit,offset}`.

### Auth / me
| Method path | Perm | Body | Response | Notes |
|---|---|---|---|---|
| POST /auth/login | – | `username` 1–40, `password` 1–128, `device_label?` ≤120 | TokenPair `{access_token, refresh_token, token_type:"bearer", expires_in}` | 401 INVALID_CREDENTIALS (also for deactivated users), 429 RATE_LIMITED |
| POST /auth/refresh | – | `refresh_token` 20–200 | TokenPair | 401 UNAUTHENTICATED, 403 ACCOUNT_INACTIVE |
| POST /auth/logout | auth | – | 204 | revokes current session |
| POST /auth/revoke | – | `refresh_token` | 204 always | |
| GET /me | auth | – | MeOut `{id, username, full_name, roles[{id,name}], permissions[], location{id,name,timezone,currency_code}, restaurant_name}` | |
| POST /me/password | auth | `current_password` 1–128, `new_password` 8–128 (no leading/trailing spaces; not all-digits or all-letters) | TokenPair | 422 fields current_password/new_password; 429 |
| GET/HEAD /health | – | – | `{status,database,time}` / 503 | |

### Staff & roles
| Method path | Perm | Body / query | Response | Notes |
|---|---|---|---|---|
| GET /users | staff.view | `include_inactive=false`, `q`≤60 (substring of name/username), `limit` 1–200 (100), `offset` | Page[UserOut] | UserOut `{id,username,full_name,is_active,roles,last_login_at,created_at,version,manageable,password_resettable}` |
| GET /users/{id} | staff.view | | UserOut | |
| POST /users | staff.create | `username` 3–40 `[A-Za-z0-9._-]`, `full_name` 1–120, `password` (strength rules), `role_ids` 1–20 | 201 UserOut | 409 CONFLICT `details.field=username`; 403 on granting a role beyond your access |
| PATCH /users/{id} | staff.update | V, `full_name?`, `role_ids?` | UserOut | 403 manage rules; 409 INVALID_TRANSITION if it would leave no Owner |
| POST /users/{id}/deactivate, /reactivate | staff.deactivate | V | UserOut | deactivate revokes all sessions |
| POST /users/{id}/password | staff.update | V, `new_password` | UserOut | needs strictly more access than the target; revokes their sessions |
| GET /permissions | roles.view | | `[{code,group,description}]` | |
| GET /roles, /roles/{id} | roles.view | | RoleOut `{id,name,description,is_system,permissions[],member_count(active),version,editable}` | |
| POST /roles | roles.create | `name`, `description?`, `permissions[]` ≤100 | 201 RoleOut | 422 unknown codes; 403 grant beyond own; 409 name |
| PATCH /roles/{id} | roles.update | V, `name?`, `description?`, `permissions?` | RoleOut | |
| DELETE /roles/{id} | roles.delete | | 204 | 409 CONFLICT if any user holds it |

### Floor
| Method path | Perm | Body | Response | Notes |
|---|---|---|---|---|
| GET /tables | tables.view | | FloorOut `{areas, tables[TableOut], server_time}` | TableOut `{id,name,capacity,area_id,area_name,status,status_note,sort_order,version,active_order}`; ActiveOrderBrief `{id,order_number,status,guest_count,opened_at,server_name,item_count,pending_count,ready_count,subtotal,bill_id,version}` |
| POST /tables | tables.create | `name` 1–20, `capacity` 1–50, `area_id?`, `sort_order` 0–10000 (0) | 201 TableOut | 409 name |
| PATCH /tables/{id} | tables.update | V, `name?`, `capacity?`, `area_id?`, `clear_area=false`, `sort_order?` | TableOut | `area_id:null` does NOT clear; use `clear_area:true` |
| DELETE /tables/{id} | tables.delete | | 204 | 409 INVALID_TRANSITION if an order is active (soft delete) |
| POST /tables/{id}/status | tables.manage_status | V, `status` ∈ AVAILABLE/RESERVED/CLEANING/BLOCKED, `note?` ≤200 | TableOut | 409 if OCCUPIED or has an active order |
| GET /table-areas | tables.view | | `[AreaOut{id,name,sort_order}]` | |
| POST /table-areas | tables.create | `name`, `sort_order` | 201 | 409 name |
| PATCH /table-areas/{id} | tables.update | `name?`, `sort_order?` | AreaOut | no version |
| DELETE /table-areas/{id} | tables.delete | | 204 | 409 CONFLICT if tables are in it |

### Menu
| Method path | Perm | Body | Notes |
|---|---|---|---|
| GET /menu | menu.view | | `{categories[{id,name,sort_order,item_count}], items[{id,category_id,name,description,price,is_available,sort_order,version}]}`; includes sold-out items, excludes deleted ones |
| POST /menu/categories | menu.manage_categories | `name`, `sort_order` | 201 CategoryOut; 409 name |
| PATCH /menu/categories/{id} | menu.manage_categories | `name?`, `sort_order?` | no version |
| DELETE /menu/categories/{id} | menu.manage_categories | | 409 if active items |
| POST /menu/items | menu.create | `category_id`, `name` 1–80, `description?` ≤300, `price` MoneyIn, `is_available=true`, `sort_order` | 201 |
| PATCH /menu/items/{id} | menu.update | V, `category_id?`, `name?`, `description?` ("" clears), `price?`, `sort_order?` | price applies to new lines only |
| POST /menu/items/{id}/availability | menu.set_availability | V, `is_available` | new lines refused while sold out |
| DELETE /menu/items/{id} | menu.delete | | soft delete, no version |

### Orders (all return OrderOut unless noted)
OrderOut `{id,order_number,status,table_id,table_name,server_id,server_name,guest_count,notes,opened_at,billed_at,closed_at,cancelled_at,cancel_reason,merged_into_id,items[{id,menu_item_id,name,unit_price,quantity,line_total,notes,status,ticket_id,void_reason,created_at}],totals{subtotal,discount_amount,service_charge_percent,service_charge_amount,taxes[{name,rate_percent,taxable_amount,amount}],tax_total,round_off,total},bill_id,currency_code,version}`.

| Method path | Perm | Body / query | Idem | V | Notes |
|---|---|---|---|---|---|
| GET /orders | orders.view | `status` (repeatable), `table_id`, `since` (opened_at ≥), `limit` 1–200 (50), `offset` | | | Page[OrderSummary] `{id,order_number,status,table_id,table_name,server_name,guest_count,opened_at,closed_at,item_count,subtotal,version}`, newest first |
| POST /orders | orders.create | `table_id`, `guest_count` 1–100 (1), `notes?`, `items[]` ≤100 of `{menu_item_id, quantity 1–999 (1), notes? ≤200}` | ✓ | | 201. 409 INVALID_TRANSITION `details.reason=TABLE_OCCUPIED` or `details.status` (not seatable); 422 missing/sold-out items (`details.menu_item_ids` / `details.unavailable`) |
| GET /orders/{id} | orders.view | | | | |
| PATCH /orders/{id} | orders.update | `guest_count?`, `notes?` | | ✓ | OPEN or BILLED |
| POST /orders/{id}/items | orders.update | `items` 1–100 | ✓ | | OPEN. Merges into an identical PENDING line (same item + note + unit price); combined qty over 999 → 422 |
| PATCH /orders/{id}/items/{iid} | orders.update | `quantity?`, `notes?` | | | PENDING only; raising qty on a sold-out item → 422 |
| DELETE /orders/{id}/items/{iid} | orders.update | | | | PENDING only; returns 200 OrderOut |
| POST /orders/{id}/items/{iid}/void | **orders.cancel** | `reason` | | | OPEN; not PENDING/VOIDED |
| POST /orders/{id}/items/{iid}/serve | orders.update | – | | | item READY; order OPEN/BILLED/CLOSED; does not bump order version |
| POST /orders/{id}/fire | orders.update | – | ✓ | ✓ | 409 if nothing pending |
| POST /orders/{id}/cancel | orders.update (+orders.cancel if anything fired, checked in service) | `reason` | | ✓ | OPEN only |
| POST /orders/{id}/transfer | orders.transfer | `table_id` | | ✓ | OPEN or BILLED |
| POST /orders/{id}/merge | orders.transfer | `source_order_id`, `source_version` | | ✓ (both) | returns the target order |
| POST /orders/{id}/split | orders.transfer | `table_id`, `item_ids` 1–200, `guest_count` (1) | | ✓ | **201, returns the NEW order** |

### Kitchen
| GET /kitchen/tickets | kitchen.view | `include_recent=true` | KitchenBoardOut `{tickets[TicketOut], server_time}`: active tickets oldest first, plus tickets COMPLETED in the last 30 min (CANCELLED ones are never listed) |
|---|---|---|---|
| POST /kitchen/tickets/{id}/transition | kitchen.update | V, `to` ∈ ACCEPTED/PREPARING/READY/COMPLETED | TicketOut `{id,ticket_number,status,order_id,order_number,order_status,order_notes,table_name,server_name,fired_at,accepted_at,started_at,ready_at,completed_at,items[{id,name,quantity,notes,status}],version}` |

### Billing
BillOut `{id,bill_number,status,order_id,order_number,table_name,server_name,guest_count,currency_code,subtotal,discount_type,discount_value,discount_amount,discount_reason,service_charge_percent,service_charge_amount,taxes[],tax_total,round_off,total,paid_total,refunded_total,balance_due,payments[{id,kind,payment_method_id,method_name,amount,tendered,change_due,reference,reason,is_correction,created_by_name,created_at}],created_by_name,created_at,paid_at,voided_at,void_reason,version}`.

| Method path | Perm | Body / query | Idem | V | Notes |
|---|---|---|---|---|---|
| GET /bills | billing.view | `status` (repeatable), `since` (created_at), `paid_since` (paid_at; also switches sort to paid_at desc), `limit` 1–200 (50), `offset` | | | Page[BillSummary] `{id,bill_number,status,order_id,order_number,table_name,total,paid_total,balance_due,created_at,paid_at,version}` |
| POST /bills | billing.create | `order_id`, `order_version` | ✓ | order | 201. 409 if already billed (`details.bill_id`), items pending, or nothing to bill |
| GET /bills/{id} | billing.view | | | | |
| POST /bills/{id}/discount | billing.discount | `type` PERCENT/FIXED/null, `value?` >0 (PERCENT ≤100), `reason?` | | ✓ | set: value+reason required; clear: `type:null`, no value |
| POST /bills/{id}/void | billing.void | `reason` | | ✓ | |
| POST /bills/{id}/payments | billing.process_payment | `payment_method_id`, `amount` >0, `tendered?`, `reference?` ≤80 | ✓ | ✓ | 422 amount > due (`details.balance_due`), tendered on non-cash, tendered < amount, inactive method |
| POST /bills/{id}/settle | billing.process_payment | – | | ✓ | total must be 0 |
| POST /bills/{id}/refunds | billing.refund | `payment_method_id`, `amount`, `reason` | ✓ | ✓ | 422 over cap (`details.refundable`) |

### Settings
| GET /settings | settings.view | | SettingsOut `{restaurant_name,location_name,address,timezone,currency_code,service_charge_percent,service_charge_taxable,rounding_increment,bill_prefix,status_after_payment,version,tax_rates[{id,name,rate_percent,is_active,sort_order}],payment_methods[all, incl. inactive]}` |
|---|---|---|---|
| PATCH /settings | settings.update | V, `restaurant_name?` 1–120 (needs ALL permissions), `location_name?`, `address?` ≤300 ("" clears), `timezone?` (IANA), `currency_code?` `^[A-Z]{3}$`, `service_charge_percent?` 0–100 (2 dp), `service_charge_taxable?`, `rounding_increment?` ∈ "0.01","0.05","0.10","0.25","0.50","1.00", `bill_prefix?` `^[A-Z0-9-]{1,12}$`, `status_after_payment?` AVAILABLE/CLEANING | An explicit null means no change |
| PUT /settings/tax-rates | settings.update | V, `tax_rates` ≤10 of `{id?, name, rate_percent 0–100 (3 dp), is_active=true}` | full replace; omitted ids are deleted; order = sort_order |
| GET /payment-methods | **billing.view** | | active only, `[{id,name,is_cash,is_active,sort_order}]` |
| POST /payment-methods | settings.update | `name` 1–40, `is_cash=false`, `is_active=true`, `sort_order` 0–1000 | 201 |
| PATCH /payment-methods/{id} | settings.update | all optional | no version, no delete |

### Insights
| GET /dashboard | dashboard.view | | DashboardOut `{server_time,business_date,currency_code,tables?,kitchen?,open_orders?,ready_items?,open_bills?,open_bills_amount?,sales_today?,recent_activity?}` |
|---|---|---|---|
| GET /reports/summary | reports.view | `start`, `end` (YYYY-MM-DD, required) | ReportOut; 422 if end<start, >366 days, or outside 2000–2100 |
| GET /audit-logs | audit_logs.view | `before_id`, `entity_type` ≤32 (exact), `action` ≤64 (prefix), `actor_id`, `limit` 1–100 (50) | AuditPage `{items[{id,action,entity_type,entity_id,summary,actor_id,actor_name,metadata,created_at}], next_before_id}` |

Idempotency (`services/idempotency.py`): the key is 8–80 ASCII characters and is scoped per (user, route incl. id, key). A replay returns the stored body and status with the header `Idempotent-Replayed: true`. The same key with a different payload returns 422 IDEMPOTENCY_MISMATCH. With no header, the request runs normally. `purge_expired` defaults to 48 h.

## 4. State machines (services)

**Table** (`TableStatus`): OCCUPIED is set only by `occupy()`, which runs on open order, transfer target, and split target. `release(used)` → CLEANING if any item was ever fired (SENT/PREPARING/READY/SERVED), else AVAILABLE. It runs on cancel, on transfer (source table), and on merge (source table). Settling a bill (payment or settle) sets the table to `location.status_after_payment` (AVAILABLE|CLEANING). Manual `POST status` covers AVAILABLE/RESERVED/CLEANING/BLOCKED. It is refused while OCCUPIED or while an order is active, and the note is cleared on AVAILABLE. Seatable = AVAILABLE, RESERVED, CLEANING. Voiding a bill leaves the table OCCUPIED.

**Order**: OPEN → BILLED (create bill) → CLOSED (bill settled). BILLED → OPEN (bill voided). OPEN → CANCELLED (cancel). OPEN → MERGED (merge source; sets `merged_into_id` and `closed_at`). Active = OPEN, BILLED. Items can be added, edited, removed, or voided, and the order can be fired, split, merged, or cancelled, only while OPEN. Guests/notes and transfer are allowed on OPEN|BILLED. Serve is allowed on OPEN|BILLED|CLOSED.

**Order item**: PENDING → SENT (fire; all pending lines become one NEW ticket) → PREPARING/READY/SERVED via ticket transitions. READY → SERVED via serve. A PENDING line is removed (deleted), never voided. A non-pending line is voided (VOIDED + reason). After a void or serve, the ticket settles: if every item is VOIDED → ticket CANCELLED; if all live items are SERVED → COMPLETED (after serve, only when the ticket is READY).

**Kitchen ticket** `TRANSITIONS`: NEW→{ACCEPTED, PREPARING}; ACCEPTED→{PREPARING}; PREPARING→{READY}; READY→{COMPLETED, PREPARING}; COMPLETED and CANCELLED are terminal. Requesting the current state is a no-op (no version check). Refused if the ticket or its order is CANCELLED. Item effects on non-voided items: →PREPARING: SENT/READY→PREPARING (recall), stamps `started_at` once and clears `ready_at`. →READY: SENT/PREPARING→READY, stamps `ready_at`. →COMPLETED: SENT/PREPARING/READY→SERVED. →ACCEPTED: no item change.

**Bill**: OPEN → PAID when `net_paid ≥ total` after a payment, or via settle when total = 0. PAID → PARTIALLY_REFUNDED / REFUNDED (REFUNDED when `refunded_total ≥ paid_total`). OPEN → VOID. `net_paid = paid_total − refunded_total`; `balance_due = max(total − net_paid, 0)`.
- *Create*: order OPEN, version matches, no PENDING items, ≥1 live item, total ≤ 9999999999.99. Number = `{bill_prefix}-{n:06d}`. The bill snapshots currency, service %, service-taxable flag, rounding increment, and the active tax rates. Settle closes the order, sets `closed_at = paid_at`, and releases the table in the same transaction.
- *Discount*: only OPEN with net_paid = 0 (otherwise 409 "Refund them first"). FIXED ≤ subtotal (else 422). Recomputes from the bill's own snapshot and bumps the versions of **both bill and order**. `type:null` clears it.
- *Void*: only OPEN with net_paid = 0 (otherwise "Use a refund instead" / "Refund them first"). The order returns to OPEN.
- *Pay*: bill OPEN, method active, `amount ≤ balance_due`. `tendered` only for `is_cash` methods, must be ≥ amount, and `change_due = tendered − amount`.
- *Refund*: allowed on OPEN/PAID/PARTIALLY_REFUNDED. The per-method cap is that method's payments minus its refunds, and inactive methods are allowed. A refund on an OPEN bill is a **correction**: `is_correction=true`, the status stays OPEN, balance_due goes back up, and reports exclude it from refunds. Refunds never reopen the order.

**Rounding/money** (`money.compute`): subtotal = Σ live line totals (unit_price × qty). Discount: PERCENT = q(subtotal × v/100), FIXED = min(v, subtotal). net = subtotal − discount. service = q(net × pct/100). taxable = net + (service if service_charge_taxable). Each tax = q(taxable × rate/100), each on the same base (not compounded). exact = net + service + Σtax. total = round exact to `rounding_increment` with HALF_UP. If exact > 0 would round to 0, total = exact. round_off = total − exact. All `q` = 2 dp HALF_UP. Rounding whitelist: 0.01, 0.05, 0.10, 0.25, 0.50, 1.00.

**Split**: order OPEN and version matches; every id is on the order; none VOIDED. Refused (409) if any selected item's ticket is not COMPLETED/CANCELLED, so PENDING items (no ticket) and items whose ticket is finished are the only eligible ones. Cannot select every live item ("Move the whole order instead"). Target must be a different table with no active order and seatable. The new order keeps the original server, gets `guest_count` from the body, and has no notes.
**Merge**: source ≠ target; both OPEN; both versions match. Items and tickets move to the target. guests = min(sum, 100). Source becomes MERGED, and its table is released (used rule).
**Transfer**: OPEN|BILLED; different table; target free and seatable. The source table is released (used rule).
**Cancel**: OPEN only (a BILLED order must have its bill voided first). If anything was fired, `orders.cancel` is also required ("A manager needs to cancel this order."). PENDING lines are deleted; others become VOIDED with reason `Order cancelled: {reason}`. Tickets settle, and the table is released.

## 5. RBAC

Catalog (`core/permissions.py`, group — code — description):
Dashboard: `dashboard.view` See the operations dashboard. Tables: `tables.view` See the floor and table status; `tables.create` Add tables and areas; `tables.update` Edit table details and areas; `tables.delete` Remove tables and areas; `tables.manage_status` Mark tables reserved, cleaning, blocked or available. Orders: `orders.view` See orders; `orders.create` Open tables and start orders; `orders.update` Add, edit and send items; `orders.cancel` Void sent items and cancel orders; `orders.transfer` Move, merge and split orders between tables. Kitchen: `kitchen.view` See kitchen tickets; `kitchen.update` Accept, prepare, ready and complete tickets. Billing: `billing.view` See bills and payments; `billing.create` Issue bills for orders; `billing.discount` Apply or remove bill discounts; `billing.void` Void unpaid bills; `billing.process_payment` Take payments; `billing.refund` Refund paid bills. Menu: `menu.view` See the menu; `menu.create` Add menu items; `menu.update` Edit items and prices; `menu.set_availability` Mark items available or sold out; `menu.delete` Remove menu items; `menu.manage_categories` Create, edit and remove categories. Staff: `staff.view` See staff accounts; `staff.create` Create staff accounts; `staff.update` Edit staff, assign roles, reset passwords; `staff.deactivate` Deactivate and reactivate staff. Roles: `roles.view` See roles and permissions; `roles.create` Create roles; `roles.update` Rename roles and change their permissions; `roles.delete` Delete roles. Reports: `reports.view`. Settings: `settings.view`; `settings.update` Change taxes, payment methods and billing settings. Audit: `audit_logs.view` Review the audit log.

Default roles:
- **Owner**: ALL. System role; can't be edited or removed.
- **Administrator**: ALL except `roles.delete`.
- **Manager**: all except `tables.delete`, `roles.create`, `roles.update`, `roles.delete`, `settings.update`.
- **Cashier**: dashboard.view, tables.view, orders.view, billing.view, billing.create, billing.process_payment, menu.view.
- **Kitchen Staff**: kitchen.view, kitchen.update, menu.view, menu.set_availability.
- **Floor Staff**: dashboard.view, tables.view, tables.manage_status, orders.view, orders.create, orders.update, orders.transfer, kitchen.view, billing.view, billing.create, menu.view.

Anti-escalation (`services/staff.py`):
- **manageable** = target ≠ self and target perms ⊆ actor perms.
- **password_resettable** = target ≠ self and target perms ⊂ actor perms (strict subset, so peers can't reset each other).
- You can't assign a role unless role perms ⊆ actor perms.
- You can't grant permissions you don't hold (403 `details.permissions`).
- **Role editable** = not a system role, role perms ⊆ actor perms, actor doesn't hold the role, and every member's perms ⊆ actor perms. This covers both update and delete.
- **_serialize**: an advisory lock per restaurant, which also re-checks that the actor is still active.
- **Last owner**: removing the Owner role from, or deactivating, the last active Owner → 409 INVALID_TRANSITION "There must always be at least one active Owner."
- Permissions are loaded from the DB on every request. Tokens carry none, so role changes take effect on the next call.

UI: use the server flags `manageable`, `password_resettable`, and `editable` to disable controls, and use the Android blocker copy: "You can't change your own access. Ask another manager.", "This person has access you don't have, so you can't manage them.", "Only someone with more access can reset this password." A restaurant rename requires the actor to hold every permission.

## 6. Money & time

- Every amount is server-computed: line totals, order `totals` (for an unbilled order, an estimate from current settings with no discount), bill figures, `balance_due`, `change_due`, and refund caps. The Android `BillMath` only chooses what to show.
- Decimals travel as JSON **strings** (`"893.02"`, rates like `"5.000"`). Inputs can be sent as strings and are quantized to cents. Never use floats.
- Currency comes from `me.location.currency_code` (also `currency_code` on OrderOut/BillOut/Dashboard/Report). The timezone comes from `me.location.timezone`. Timestamps are ISO UTC.
- Day boundaries: `[start 00:00, end+1 00:00)` in the location zone, converted to UTC (DST-safe). The dashboard `business_date` is today in the location zone.
- Report semantics. Sales are bills in PAID/PARTIALLY_REFUNDED/REFUNDED, filtered by `paid_at` in range.
  - `gross_sales` = Σ total.
  - `refunds` = non-correction refunds, filtered by refund `created_at` in range, so a refund of an earlier sale is counted.
  - `net_sales` = gross − refunds.
  - `order_count` = count of paid bills. `average_order_value` = gross / count.
  - `guests`, `discounts_total`, `discounted_bills`, `tax_total`, `service_charge_total` are totals over those bills.
  - `cancelled_orders` is by `cancelled_at`. `voided_items_value` = Σ(unit × qty) of items with `voided_at` in range.
  - `daily`: every date in range, with gross by local paid date, refunds by local refund date, and net.
  - `hourly`: always 24 rows of gross by local paid hour (no refunds).
  - `top_items`: top 10 by qty (non-voided lines).
  - `payment_methods`: per `method_name`, `count` = PAYMENT rows and `amount` = payments − refunds (corrections included), filtered by payment `created_at` (open bills included).
  - `tables`: orders, revenue, `average_minutes` (closed − opened).
  - `staff`: by the order's server.
- Dashboard: `sales_today.net_sales` = gross − refunds today, and `average_bill` = **net**/bills. `open_bills_amount` = Σ(total − paid_total) of OPEN bills. `kitchen.new` = NEW + ACCEPTED.

## 7. Errors & auth

Envelope: `{"error":{"code","message","details"}}`. Messages are written for staff and shown as-is. Codes (contract ErrorCode): VALIDATION_ERROR 422 (and 400 default), UNAUTHENTICATED 401, TOKEN_EXPIRED 401, INVALID_CREDENTIALS 401, ACCOUNT_LOCKED 423 (defined, never raised), ACCOUNT_INACTIVE 403, PERMISSION_DENIED 403 (`details.permission`), NOT_FOUND 404, CONFLICT 409, STALE_VERSION 409 (`details.current_version`), INVALID_TRANSITION 409, IDEMPOTENCY_MISMATCH 422, RATE_LIMITED 429 (`details.retry_after_seconds`), INTERNAL_ERROR 500/503. Handlers (`main.py`):
- Pydantic errors → 422 "Some fields need attention." with `details.fields=[{field,message}]`. `field` is the loc joined by "." after dropping body/query/path.
- Starlette 404/405 → NOT_FOUND "Not found."
- IntegrityError → 409 CONFLICT.
- DataError → 422 "Some values are out of range."
- OperationalError → 503 INTERNAL_ERROR.
- Other exceptions → 500.
- Middleware returns 413 VALIDATION_ERROR "Request is too large." above `max_body_bytes` (256 KB; Caddy caps at 512 KB).
- 401 responses carry `WWW-Authenticate: Bearer`. `X-Request-ID` (8–64 `[A-Za-z0-9-]`) is echoed.

Auth flow:
- Access TTL is 15 min and the refresh TTL is 30 days. The session expiry is fixed at login and is not extended by rotation.
- Login throttle: 5 failures per (username, IP) in a sliding 15-min window lock that pair for 15 min, and 30 failures per IP lock the IP. A deactivated account answers the same as a wrong password.
- Refresh rotates the token. Reusing a rotated token revokes the whole session (401). Within a **10 s grace**, the old token may be replayed only if its successor is unused: the successor is discarded and a new pair is issued.
- Inactive user on refresh → 403 ACCOUNT_INACTIVE.
- Access-token checks: expired → TOKEN_EXPIRED; `token_version` mismatch or revoked session → UNAUTHENTICATED; inactive → ACCOUNT_INACTIVE.
- `logout` revokes the current session. `revoke` works with only the refresh token.
- Change password: throttled per user; a wrong current password → 422 (not 401). On success it revokes all sessions, bumps `token_version`, and returns a new TokenPair; the client must adopt it.
- Admin password reset and deactivation also revoke all sessions and bump `token_version`.
- Android: the access token lives in memory and the refresh token is persisted. A 401 triggers a single-flight refresh, then the request is replayed. A refresh that fails on the network surfaces as offline, not as sign-out.

Android mapping (`AppError.kt`): UNAUTHENTICATED/TOKEN_EXPIRED/ACCOUNT_INACTIVE → SessionEnded (sign out); INVALID_CREDENTIALS → Validation; PERMISSION_DENIED; NOT_FOUND; STALE_VERSION → Stale; INVALID_TRANSITION → InvalidState; CONFLICT/IDEMPOTENCY_MISMATCH → Conflict; VALIDATION_ERROR → Validation + field map; RATE_LIMITED/ACCOUNT_LOCKED → RateLimited; INTERNAL_ERROR → Server. Fallback by HTTP code: 413 "That's too much data to send at once.", 429 "Too many attempts. Wait a moment and try again.", 5xx "The server is having trouble. Try again in a moment." Offline: "You're offline. Check the restaurant Wi-Fi and try again." Timeout: "The server is taking too long to respond. Try again." "Try again" is offered only for Offline/Timeout/Server/Unexpected. After a Stale or InvalidState error, screens refetch. On login, SessionEnded is shown as "Incorrect username or password."

## 8. UX patterns to preserve

- **Polling** (only while visible): Kitchen 4 s, Floor 5 s, Order 8 s, Home 10 s, Bills 10 s, Bill 10 s while OPEN / 60 s otherwise, Orders 15 s, Menu, Tables & areas and Activity log 30 s, Staff and Roles 60 s, Settings 120 s. A "generation" guard drops a poll result that lands after a user action.
- **Stale data**: when a refresh fails over loaded data, keep the data and show `StaleBanner` (warning tone, polite live region). A blank error screen appears only when nothing has loaded yet.
- **Idempotency key per intent**:
  - Seat: one key per seat sheet.
  - OrderViewModel: `fireKey` and `billKey` are (order version, key) pairs, reused only for a retry at the same version and cleared on success. Before firing, debounced qty edits are flushed.
  - AddItemsViewModel: `addKey` and `fireKey` are reset on any cart change. If the add succeeds but the send fails, show "Added, but not sent: …".
  - BillViewModel: `MoneyIntent(key, version, fingerprint)` for pay (bill, method, amount, tendered, reference) and refund (bill, method, amount, reason). The same fingerprint reuses the key and the original version. The intent is dropped when the server definitively refuses (Stale/InvalidState/Validation/Conflict/PermissionDenied/NotFound) or when the bill version moves. In that case the pay sheet closes with "A payment was recorded. Check the balance before charging again.", and if a refresh shows the bill paid, the sheet switches to its settled state.
- **Status visuals** (label/tone):
  - Table: Available/success, Occupied/accent, Reserved/info, Cleaning/cleaning, Blocked/neutral.
  - Ticket: New/info, Accepted/info, Preparing/warning, Ready/success, COMPLETED→"Served"/neutral, Cancelled/danger.
  - Item: PENDING "Not sent"/warning, SENT "In kitchen"/info, Preparing/warning, Ready/success, Served/neutral, Voided/danger.
  - Order: Open/accent, BILLED "Bill issued"/info, Closed/success, Cancelled/danger, Merged/neutral.
  - Bill: OPEN "Awaiting payment"/warning, Paid/success, PARTIALLY_REFUNDED "Part refunded"/info, Refunded/neutral, Void/danger.
- **Kitchen**:
  - Lanes: "New" (NEW+ACCEPTED), "Preparing", "Ready", "Done" (COMPLETED/CANCELLED, last 30 min, newest first). Active lanes are oldest first.
  - Buttons: primary Start→PREPARING, Ready→READY, Served→COMPLETED; secondary Accept (NEW), Recall (READY→PREPARING).
  - Timer labels: Waiting/Accepted/Cooking/"At the pass" (measured from `ready_at`)/Took.
  - Urgency: ≥10 min "Running late", ≥20 min "Overdue", else "On time". The timer uses the board's `server_time`.
  - Per-ticket busy lock. No optimistic updates.
- **Terminology**: "Send to kitchen", "Issue bill", "Take payment", "View bill", "Close bill", "Bill issued", "Not sent yet", "Ready to serve", "In the kitchen", "Check #n", "Open table", "Seat guests", "Paid in full", "Activity log".
- **Confirmations**: Void item ("Void n× X?", reason, "Void item"); Cancel order ("Cancel check #n?", reason); Move/Merge (confirm the picked table: "Move"/"Merge"; a merge can't be undone; split has none); Void bill ("Void bill X?", reason); Refund ("Refund {amount}?"); Discard cart ("Discard n items?"); Sign out ("Sign out?"); Remove table/area, Remove item, Delete category, and Delete role.

## 9. Gaps (API vs web needs)

- **No CORS**: `cors_origins` exists in `config.py` but no middleware uses it. Caddy proxies only `/api/v1/*`, answers everything else with "Bistro API", and sends `X-Frame-Options: DENY`. A browser client on another origin will fail until this is added, or the SPA must be served same-origin via Caddy.
- Tokens are body-based (no cookies), so the web client must store the refresh token itself.
- No push (WebSocket/SSE). Polling only.
- Audit log: no date-range filter, and no free-text search. Filters are only `before_id`, exact `entity_type`, `action` prefix, and `actor_id`, with a max of 100 per page. Area actions (`area.*`) aren't covered by Android's "Tables" chip.
- Reports: only `start`/`end`. No filters by staff, table, method, or area; no export/CSV; max 366 days; top items fixed at 10; hourly has no refunds.
- Orders: no search by order number, table, or server; only `since` (no `until`); no date filter on `closed_at`.
- Bills: no search by bill number; `since`/`paid_since` but no upper bound.
- Server-side search exists only for `/users?q`. The menu has no search or pagination.
- No endpoint for deleted/inactive menu items or categories, removed tables, or areas.
- Kitchen: no ticket history beyond 30 min, no single-ticket GET, and cancelled tickets are never listed.
- No receipt/print/email endpoint, no reopen of CLOSED/CANCELLED orders, no un-void, no refund on a VOID bill.
- No session/device listing and no "sign out other devices" (only as a side effect of a password change).
- No self-service password recovery.
- No payment-method delete (deactivate only). `/payment-methods` returns active methods only; inactive ones are visible only via `/settings` (`settings.view`).
- Versionless mutations (last write wins): area and category PATCH, payment-method PATCH, table/menu-item/area/category DELETE, item qty/note PATCH.
- `ACCOUNT_LOCKED` is in the contract but never emitted, and the `ServerTime` schema is unused.
