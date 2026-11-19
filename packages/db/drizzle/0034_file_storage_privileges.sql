-- The rows of file storage (docs/specs/0012-file-storage.md). A file never changes once it is
-- kept, so no role updates either table and neither has an updated_at trigger.
revoke all on uploaded_files, account_files from anon, authenticated, service_role, opos_app, opos_app_global, opos_admin;
--> statement-breakpoint

-- A convention's or an edition's file: a tenant table, written by the API inside its tenant.
grant select, insert, delete on uploaded_files to opos_app;
--> statement-breakpoint
alter table uploaded_files enable row level security;
--> statement-breakpoint
alter table uploaded_files force row level security;
--> statement-breakpoint
create policy tenant_isolation on uploaded_files
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

-- An account's file: global, as accounts is, with no RLS; the API writes there only a file of the
-- account its session names.
grant select, insert, delete on account_files to opos_app;
--> statement-breakpoint

-- The sweep, the API's own job, reads across tenants which files exist, of what kind and since
-- when: identifiers, never a name or a checksum.
grant select (id, tenant_id, kind, created_at) on uploaded_files to opos_app_global;
--> statement-breakpoint
grant select (id, account_id, kind, created_at) on account_files to opos_app_global;
