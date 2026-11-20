-- The discount codes of an edition (docs/specs/0008-discount-codes.md): four tenant tables under
-- RLS, each an edition's.
revoke all on discount_codes, discount_code_ticket_types, discount_code_add_ons,
  discount_code_merchandise_items
  from anon, authenticated, service_role, opos_app, opos_app_global, opos_admin;
--> statement-breakpoint

-- An org sets a code, changes its terms, ends it and deletes one no order used: an order's
-- foreign key refuses the deletion of one that was. A code never moves to another edition.
grant select, insert, delete on discount_codes to opos_app;
--> statement-breakpoint
grant update (code, kind, percent, amount_minor, usage_limit, valid_from, valid_until, ended_at)
  on discount_codes to opos_app;
--> statement-breakpoint
alter table discount_codes enable row level security;
--> statement-breakpoint
alter table discount_codes force row level security;
--> statement-breakpoint
create policy tenant_isolation on discount_codes
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger discount_codes_set_updated_at
  before update on discount_codes
  for each row execute function public.set_updated_at();
--> statement-breakpoint

-- What a code applies to is a row added and a row removed, never one changed.
grant select, insert, delete on discount_code_ticket_types to opos_app;
--> statement-breakpoint
alter table discount_code_ticket_types enable row level security;
--> statement-breakpoint
alter table discount_code_ticket_types force row level security;
--> statement-breakpoint
create policy tenant_isolation on discount_code_ticket_types
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

grant select, insert, delete on discount_code_add_ons to opos_app;
--> statement-breakpoint
alter table discount_code_add_ons enable row level security;
--> statement-breakpoint
alter table discount_code_add_ons force row level security;
--> statement-breakpoint
create policy tenant_isolation on discount_code_add_ons
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

grant select, insert, delete on discount_code_merchandise_items to opos_app;
--> statement-breakpoint
alter table discount_code_merchandise_items enable row level security;
--> statement-breakpoint
alter table discount_code_merchandise_items force row level security;
--> statement-breakpoint
create policy tenant_isolation on discount_code_merchandise_items
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
