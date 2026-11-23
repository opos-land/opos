-- The scanners of an edition (docs/specs/0007-scanner.md): a tenant table under RLS, an edition's.
revoke all on scanner_devices
  from anon, authenticated, service_role, opos_app, opos_app_global, opos_admin;
--> statement-breakpoint

-- A scanner is enabled once, with its name, its end and the org behind it, which no role changes
-- afterwards. What changes is that a phone was paired with it and holds its token, when it was
-- last used, and that it was revoked. No role deletes one: the hand-outs it marked name it.
grant select, insert on scanner_devices to opos_app;
--> statement-breakpoint
grant update (paired_at, token_hash, last_used_at, revoked_at) on scanner_devices to opos_app;
--> statement-breakpoint
alter table scanner_devices enable row level security;
--> statement-breakpoint
alter table scanner_devices force row level security;
--> statement-breakpoint
create policy tenant_isolation on scanner_devices
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger scanner_devices_set_updated_at
  before update on scanner_devices
  for each row execute function public.set_updated_at();
--> statement-breakpoint

-- A hand-out names the scanner that marked it; a mark taken back names none.
grant update (handed_out_by) on order_lines to opos_app;
--> statement-breakpoint

-- A pairing code and a device's token come with no tenant: each is looked up across tenants by
-- its hash, and the lookup answers the scanner and its tenant alone. Everything else of the
-- device is read in the tenant's own transaction.
grant select (id, tenant_id, pairing_code_hash, token_hash) on scanner_devices to opos_app_global;
