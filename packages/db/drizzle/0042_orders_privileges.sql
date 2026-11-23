-- Orders and what they hold (docs/specs/0004-checkout-and-orders.md): an order with its lines, the
-- answers and consents of its ticket holder, the account it is attached to, its QR code, its
-- payment attempts, its emails and its links. Ten tenant tables under RLS, each an edition's.
revoke all on orders, order_lines, order_custom_field_answers, order_consents, order_accounts,
  order_qr_codes, order_qr_code_orders, payment_attempts, order_emails, order_links
  from anon, authenticated, service_role, opos_app, opos_app_global, opos_admin;
--> statement-breakpoint

-- An order: placed once, with its number, its prices and the data of its ticket holder, which
-- no role changes afterwards. What a payment and the end of a hold change is its status, whether
-- it holds its stock and capacity, and the moments of both. No role deletes one.
grant select, insert on orders to opos_app;
--> statement-breakpoint
grant update (status, holds, hold_ends_at, paid_at) on orders to opos_app;
--> statement-breakpoint
alter table orders enable row level security;
--> statement-breakpoint
alter table orders force row level security;
--> statement-breakpoint
create policy tenant_isolation on orders
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger orders_set_updated_at
  before update on orders
  for each row execute function public.set_updated_at();
--> statement-breakpoint

-- A line keeps what it sold and the price it was sold at: it is added with its order, and no
-- role changes or deletes it. The grant that hands a line over arrives with the routes that do.
grant select, insert on order_lines to opos_app;
--> statement-breakpoint
alter table order_lines enable row level security;
--> statement-breakpoint
alter table order_lines force row level security;
--> statement-breakpoint
create policy tenant_isolation on order_lines
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

-- What an order answered and accepted is written with it and never changed.
grant select, insert on order_custom_field_answers to opos_app;
--> statement-breakpoint
alter table order_custom_field_answers enable row level security;
--> statement-breakpoint
alter table order_custom_field_answers force row level security;
--> statement-breakpoint
create policy tenant_isolation on order_custom_field_answers
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

grant select, insert on order_consents to opos_app;
--> statement-breakpoint
alter table order_consents enable row level security;
--> statement-breakpoint
alter table order_consents force row level security;
--> statement-breakpoint
create policy tenant_isolation on order_consents
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

-- The account an order is attached to, and the QR code it carries, are rows of their own, added
-- once: no role updates a column pointing at an account or at another row.
grant select, insert on order_accounts to opos_app;
--> statement-breakpoint
alter table order_accounts enable row level security;
--> statement-breakpoint
alter table order_accounts force row level security;
--> statement-breakpoint
create policy tenant_isolation on order_accounts
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

grant select, insert on order_qr_codes to opos_app;
--> statement-breakpoint
alter table order_qr_codes enable row level security;
--> statement-breakpoint
alter table order_qr_codes force row level security;
--> statement-breakpoint
create policy tenant_isolation on order_qr_codes
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

grant select, insert on order_qr_code_orders to opos_app;
--> statement-breakpoint
alter table order_qr_code_orders enable row level security;
--> statement-breakpoint
alter table order_qr_code_orders force row level security;
--> statement-breakpoint
create policy tenant_isolation on order_qr_code_orders
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

-- A payment attempt: what its provider's module says of it changes as the provider reports;
-- the amount the order asked for and the order itself never do.
grant select, insert on payment_attempts to opos_app;
--> statement-breakpoint
grant update (status, paid_amount_minor, paid_at, confirmed_at, money_with, provider_reference,
  failure_reason, failure_code, failure_message, information)
  on payment_attempts to opos_app;
--> statement-breakpoint
alter table payment_attempts enable row level security;
--> statement-breakpoint
alter table payment_attempts force row level security;
--> statement-breakpoint
create policy tenant_isolation on payment_attempts
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger payment_attempts_set_updated_at
  before update on payment_attempts
  for each row execute function public.set_updated_at();
--> statement-breakpoint

-- An email of an order is queued once, and the outbox marks it sent or to be tried again.
grant select, insert on order_emails to opos_app;
--> statement-breakpoint
grant update (sent_at, failed_attempts, next_attempt_at) on order_emails to opos_app;
--> statement-breakpoint
alter table order_emails enable row level security;
--> statement-breakpoint
alter table order_emails force row level security;
--> statement-breakpoint
create policy tenant_isolation on order_emails
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

-- A link that opens an order without a sign-in: added with its token's hash. Ending one arrives
-- with the routes that do.
grant select, insert on order_links to opos_app;
--> statement-breakpoint
alter table order_links enable row level security;
--> statement-breakpoint
alter table order_links force row level security;
--> statement-breakpoint
create policy tenant_isolation on order_links
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

-- The three reads across tenants this module adds (docs/ARCHITECTURE.md, Tenant isolation), each
-- of identifiers alone. A provider's notification names an attempt, and the API finds the tenant
-- it belongs to; the expiry job finds the orders whose hold ended; the outbox finds the emails
-- that are due.
grant select (id, tenant_id, provider) on payment_attempts to opos_app_global;
--> statement-breakpoint
grant select (id, tenant_id, status, hold_ends_at) on orders to opos_app_global;
--> statement-breakpoint
grant select (id, tenant_id, sent_at, next_attempt_at) on order_emails to opos_app_global;
