-- Organizer invitations (PLAN.md 7.7): the API creates a membership for a known account or when an
-- invitation is accepted, and records every accepted invitation once.
grant insert on tenant_memberships to opos_app;
--> statement-breakpoint

-- accepted_invitations: inserted and read by the API, never changed or removed by it.
grant select, insert on accepted_invitations to opos_app;
--> statement-breakpoint
grant select on accepted_invitations to opos_app_global;
--> statement-breakpoint
revoke all on accepted_invitations from anon, authenticated, service_role;
--> statement-breakpoint
alter table accepted_invitations enable row level security;
--> statement-breakpoint
alter table accepted_invitations force row level security;
--> statement-breakpoint
create policy tenant_isolation on accepted_invitations
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger accepted_invitations_set_updated_at
  before update on accepted_invitations
  for each row execute function public.set_updated_at();
