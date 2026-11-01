-- Programme items, their speakers and likes (PLAN.md 4.4). Nothing in the API uses them yet: each
-- write and cross-tenant read gets its grant in the migration of the route that makes it.
grant select on program_items to opos_app;
--> statement-breakpoint
revoke all on program_items from anon, authenticated, service_role;
--> statement-breakpoint
alter table program_items enable row level security;
--> statement-breakpoint
alter table program_items force row level security;
--> statement-breakpoint
create policy tenant_isolation on program_items
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger program_items_set_updated_at
  before update on program_items
  for each row execute function public.set_updated_at();
--> statement-breakpoint

grant select on program_item_speakers to opos_app;
--> statement-breakpoint
revoke all on program_item_speakers from anon, authenticated, service_role;
--> statement-breakpoint
alter table program_item_speakers enable row level security;
--> statement-breakpoint
alter table program_item_speakers force row level security;
--> statement-breakpoint
create policy tenant_isolation on program_item_speakers
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger program_item_speakers_set_updated_at
  before update on program_item_speakers
  for each row execute function public.set_updated_at();
--> statement-breakpoint

grant select on program_item_likes to opos_app;
--> statement-breakpoint
revoke all on program_item_likes from anon, authenticated, service_role;
--> statement-breakpoint
alter table program_item_likes enable row level security;
--> statement-breakpoint
alter table program_item_likes force row level security;
--> statement-breakpoint
create policy tenant_isolation on program_item_likes
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger program_item_likes_set_updated_at
  before update on program_item_likes
  for each row execute function public.set_updated_at();
