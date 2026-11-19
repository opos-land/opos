-- What an edition sells (docs/specs/0003-catalog.md): ticket types with their price tiers,
-- supporter prices and perks, add-ons, merchandise items with their axes, values, variants,
-- pictures and size charts, what a ticket type offers of them, and the edition's custom fields.
-- Fifteen tenant tables under RLS, each an edition's.
revoke all on ticket_types, ticket_type_price_tiers, ticket_type_supporter_prices,
  ticket_type_perks, add_ons, ticket_type_add_ons, merchandise_items,
  ticket_type_merchandise_items, merchandise_option_axes, merchandise_option_values,
  merchandise_variants, merchandise_variant_values, merchandise_item_pictures,
  merchandise_size_charts, edition_custom_fields
  from anon, authenticated, service_role, opos_app, opos_app_global, opos_admin;
--> statement-breakpoint

-- A ticket type: everything a screen sets of it changes; the edition it belongs to never does.
grant select, insert, delete on ticket_types to opos_app;
--> statement-breakpoint
grant update (name, short_description, long_description, capacity, sale_starts_at, sale_ends_at,
  allows_child, allows_teen, allows_adult, discounts_excluded, shown_outside_sale_window, position,
  hidden_at)
  on ticket_types to opos_app;
--> statement-breakpoint
alter table ticket_types enable row level security;
--> statement-breakpoint
alter table ticket_types force row level security;
--> statement-breakpoint
create policy tenant_isolation on ticket_types
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger ticket_types_set_updated_at
  before update on ticket_types
  for each row execute function public.set_updated_at();
--> statement-breakpoint

-- The tiers, supporter prices and perks of a ticket type travel with it as whole lists: a change
-- deletes the list and adds the new one, so no role updates a row of them.
grant select, insert, delete on ticket_type_price_tiers to opos_app;
--> statement-breakpoint
alter table ticket_type_price_tiers enable row level security;
--> statement-breakpoint
alter table ticket_type_price_tiers force row level security;
--> statement-breakpoint
create policy tenant_isolation on ticket_type_price_tiers
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

grant select, insert, delete on ticket_type_supporter_prices to opos_app;
--> statement-breakpoint
alter table ticket_type_supporter_prices enable row level security;
--> statement-breakpoint
alter table ticket_type_supporter_prices force row level security;
--> statement-breakpoint
create policy tenant_isolation on ticket_type_supporter_prices
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

grant select, insert, delete on ticket_type_perks to opos_app;
--> statement-breakpoint
alter table ticket_type_perks enable row level security;
--> statement-breakpoint
alter table ticket_type_perks force row level security;
--> statement-breakpoint
create policy tenant_isolation on ticket_type_perks
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

-- An add-on: its name, its price, what limits it, its place and whether it is hidden change.
grant select, insert, delete on add_ons to opos_app;
--> statement-breakpoint
grant update (name, description, amount_minor, kind, capacity, places_left_threshold, position,
  hidden_at)
  on add_ons to opos_app;
--> statement-breakpoint
alter table add_ons enable row level security;
--> statement-breakpoint
alter table add_ons force row level security;
--> statement-breakpoint
create policy tenant_isolation on add_ons
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger add_ons_set_updated_at
  before update on add_ons
  for each row execute function public.set_updated_at();
--> statement-breakpoint

-- What a ticket type offers: a row is added and deleted, and points at nothing else afterwards.
grant select, insert, delete on ticket_type_add_ons to opos_app;
--> statement-breakpoint
alter table ticket_type_add_ons enable row level security;
--> statement-breakpoint
alter table ticket_type_add_ons force row level security;
--> statement-breakpoint
create policy tenant_isolation on ticket_type_add_ons
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

grant select, insert, delete on ticket_type_merchandise_items to opos_app;
--> statement-breakpoint
alter table ticket_type_merchandise_items enable row level security;
--> statement-breakpoint
alter table ticket_type_merchandise_items force row level security;
--> statement-breakpoint
create policy tenant_isolation on ticket_type_merchandise_items
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

-- A merchandise item: what a screen sets of it changes.
grant select, insert, delete on merchandise_items to opos_app;
--> statement-breakpoint
grant update (name, description, amount_minor, per_order_limit, pictures_illustrative, position,
  hidden_at)
  on merchandise_items to opos_app;
--> statement-breakpoint
alter table merchandise_items enable row level security;
--> statement-breakpoint
alter table merchandise_items force row level security;
--> statement-breakpoint
create policy tenant_isolation on merchandise_items
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger merchandise_items_set_updated_at
  before update on merchandise_items
  for each row execute function public.set_updated_at();
--> statement-breakpoint

-- An axis and a value are renamed and moved; neither moves to another item or another axis.
grant select, insert, delete on merchandise_option_axes to opos_app;
--> statement-breakpoint
grant update (name, position) on merchandise_option_axes to opos_app;
--> statement-breakpoint
alter table merchandise_option_axes enable row level security;
--> statement-breakpoint
alter table merchandise_option_axes force row level security;
--> statement-breakpoint
create policy tenant_isolation on merchandise_option_axes
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

grant select, insert, delete on merchandise_option_values to opos_app;
--> statement-breakpoint
grant update (label, position) on merchandise_option_values to opos_app;
--> statement-breakpoint
alter table merchandise_option_values enable row level security;
--> statement-breakpoint
alter table merchandise_option_values force row level security;
--> statement-breakpoint
create policy tenant_isolation on merchandise_option_values
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

-- A variant: its stock changes and it is hidden and shown. Its values are set with it: a variant
-- of other values is another variant.
grant select, insert, delete on merchandise_variants to opos_app;
--> statement-breakpoint
grant update (stock, hidden_at) on merchandise_variants to opos_app;
--> statement-breakpoint
alter table merchandise_variants enable row level security;
--> statement-breakpoint
alter table merchandise_variants force row level security;
--> statement-breakpoint
create policy tenant_isolation on merchandise_variants
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger merchandise_variants_set_updated_at
  before update on merchandise_variants
  for each row execute function public.set_updated_at();
--> statement-breakpoint

grant select, insert, delete on merchandise_variant_values to opos_app;
--> statement-breakpoint
alter table merchandise_variant_values enable row level security;
--> statement-breakpoint
alter table merchandise_variant_values force row level security;
--> statement-breakpoint
create policy tenant_isolation on merchandise_variant_values
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

-- A picture moves among the pictures of its item; the file it points at never changes.
grant select, insert, delete on merchandise_item_pictures to opos_app;
--> statement-breakpoint
grant update (position) on merchandise_item_pictures to opos_app;
--> statement-breakpoint
alter table merchandise_item_pictures enable row level security;
--> statement-breakpoint
alter table merchandise_item_pictures force row level security;
--> statement-breakpoint
create policy tenant_isolation on merchandise_item_pictures
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

-- A size chart is put by adding a row and taken away by deleting it: no role updates one.
grant select, insert, delete on merchandise_size_charts to opos_app;
--> statement-breakpoint
alter table merchandise_size_charts enable row level security;
--> statement-breakpoint
alter table merchandise_size_charts force row level security;
--> statement-breakpoint
create policy tenant_isolation on merchandise_size_charts
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

-- A custom field: its label, whether it is required, its place and whether it is hidden change.
grant select, insert, delete on edition_custom_fields to opos_app;
--> statement-breakpoint
grant update (label, is_required, position, hidden_at) on edition_custom_fields to opos_app;
--> statement-breakpoint
alter table edition_custom_fields enable row level security;
--> statement-breakpoint
alter table edition_custom_fields force row level security;
--> statement-breakpoint
create policy tenant_isolation on edition_custom_fields
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger edition_custom_fields_set_updated_at
  before update on edition_custom_fields
  for each row execute function public.set_updated_at();
--> statement-breakpoint

-- The settings an edition gives its whole catalog, on the row of its shop.
grant update (teen_from_age, adult_from_age, guardian_consent_form_url, merch_preorder_deadline,
  merch_only_enabled, sales_closed_message)
  on edition_shops to opos_app;
--> statement-breakpoint

-- The sweep, the API's own job, tells a picture's and a size chart's file from one nothing points
-- at.
grant select (file_id) on merchandise_item_pictures to opos_app_global;
--> statement-breakpoint
grant select (file_id) on merchandise_size_charts to opos_app_global;
--> statement-breakpoint

-- The windows of one ticket type's price tiers never overlap: a moment has one price or none. A
-- window holds its start and not its end, so one may end at the moment the next one starts. The
-- constraint compares a uuid for equality inside a GiST index, which takes btree_gist.
create extension if not exists btree_gist with schema extensions;
--> statement-breakpoint
alter table ticket_type_price_tiers
  add constraint ticket_type_price_tiers_no_overlap
  exclude using gist (
    ticket_type_id extensions.gist_uuid_ops with =,
    tstzrange(starts_at, ends_at) with &&
  );
--> statement-breakpoint

-- Two foreign keys without a cascade, checked when the transaction ends and not after each
-- statement, as those of a document's version are: an edition goes with its pictures, its size
-- charts and their files along several paths at once, and a key checked at once would refuse the
-- edition's own deletion. Checked at the end, each refuses only a file something still points at.
alter table merchandise_item_pictures
  alter constraint merchandise_item_pictures_file_fk deferrable initially deferred;
--> statement-breakpoint
alter table merchandise_size_charts
  alter constraint merchandise_size_charts_file_fk deferrable initially deferred;
