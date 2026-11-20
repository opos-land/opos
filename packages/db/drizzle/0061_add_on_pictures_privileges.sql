-- The picture of an add-on (docs/specs/0003-catalog.md, A9): a tenant table under RLS, an
-- edition's.
revoke all on add_on_pictures
  from anon, authenticated, service_role, opos_app, opos_app_global, opos_admin;
--> statement-breakpoint

-- A picture is put by adding a row and taken away by deleting it: no role updates one.
grant select, insert, delete on add_on_pictures to opos_app;
--> statement-breakpoint
alter table add_on_pictures enable row level security;
--> statement-breakpoint
alter table add_on_pictures force row level security;
--> statement-breakpoint
create policy tenant_isolation on add_on_pictures
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

-- The sweep, the API's own job, tells a picture's file from one nothing points at.
grant select (file_id) on add_on_pictures to opos_app_global;
--> statement-breakpoint

-- The key to the file has no cascade and is checked when the transaction ends, as those of an
-- item's picture and of a size chart are: an edition goes with its add-ons, their pictures and
-- their files along several paths at once, and a key checked at once would refuse the edition's
-- own deletion. Checked at the end, it refuses only a file a picture still points at.
alter table add_on_pictures
  alter constraint add_on_pictures_file_fk deferrable initially deferred;
