-- A convention's logo, an edition's venue and the list of editions
-- (docs/specs/0014-edition-list-and-edition-page.md).
revoke all on tenant_logos from anon, authenticated, service_role, opos_app, opos_app_global, opos_admin;
--> statement-breakpoint

-- The logo's row is added and removed, never changed: a replaced logo is a new row, so no role
-- updates the table and it has no updated_at trigger.
grant select, insert, delete on tenant_logos to opos_app;
--> statement-breakpoint
alter table tenant_logos enable row level security;
--> statement-breakpoint
alter table tenant_logos force row level security;
--> statement-breakpoint
create policy tenant_isolation on tenant_logos
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

-- The venue is set with the edition's name and dates.
grant update (venue_name, venue_address, venue_city) on editions to opos_app;
--> statement-breakpoint

-- The list of editions reads across tenants what anyone reads of a published edition: when it
-- ends, its city, and its convention's logo with the proportions of the picture. The sweep reads
-- the same pointer to tell a logo's file from one nothing points at.
grant select (ends_at, venue_city) on editions to opos_app_global;
--> statement-breakpoint
grant select (tenant_id, file_id) on tenant_logos to opos_app_global;
--> statement-breakpoint
grant select (width, height) on uploaded_files to opos_app_global;
