-- What a convention sets before an edition sells anything (docs/specs/0002-shop-setup.md): the
-- seller's details and the provider account of the convention, and for each edition its shop, its
-- legal documents with their versions, and its consents. Six tenant tables under RLS.
revoke all on shop_sellers, payment_provider_accounts, edition_shops, edition_documents,
  edition_document_versions, edition_consents
  from anon, authenticated, service_role, opos_app, opos_app_global, opos_admin;
--> statement-breakpoint

-- The seller's details: set and changed, never the currency, which is PLN alone.
grant select, insert on shop_sellers to opos_app;
--> statement-breakpoint
grant update (seller_name, seller_address, seller_registration_number, contact_email)
  on shop_sellers to opos_app;
--> statement-breakpoint
alter table shop_sellers enable row level security;
--> statement-breakpoint
alter table shop_sellers force row level security;
--> statement-breakpoint
create policy tenant_isolation on shop_sellers
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger shop_sellers_set_updated_at
  before update on shop_sellers
  for each row execute function public.set_updated_at();
--> statement-breakpoint

-- The provider account: credentials given again are a new row in place of the old, so no role
-- updates the table and it has no updated_at trigger. opos_app reads the sealed credentials, since
-- the API opens them to call the provider; no answer carries them.
grant select, insert, delete on payment_provider_accounts to opos_app;
--> statement-breakpoint
alter table payment_provider_accounts enable row level security;
--> statement-breakpoint
alter table payment_provider_accounts force row level security;
--> statement-breakpoint
create policy tenant_isolation on payment_provider_accounts
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

-- The shop of an edition: opened, closed and given its settings. The row goes with its edition.
grant select, insert on edition_shops to opos_app;
--> statement-breakpoint
grant update (opened_at, faq_url) on edition_shops to opos_app;
--> statement-breakpoint
alter table edition_shops enable row level security;
--> statement-breakpoint
alter table edition_shops force row level security;
--> statement-breakpoint
create policy tenant_isolation on edition_shops
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger edition_shops_set_updated_at
  before update on edition_shops
  for each row execute function public.set_updated_at();
--> statement-breakpoint

-- A legal document: its title changes and it is hidden and shown; its kind stays.
grant select, insert, delete on edition_documents to opos_app;
--> statement-breakpoint
grant update (title, hidden_at) on edition_documents to opos_app;
--> statement-breakpoint
alter table edition_documents enable row level security;
--> statement-breakpoint
alter table edition_documents force row level security;
--> statement-breakpoint
create policy tenant_isolation on edition_documents
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger edition_documents_set_updated_at
  before update on edition_documents
  for each row execute function public.set_updated_at();
--> statement-breakpoint

-- A version is published once and never changed: the row is added, and goes only with its
-- document, so no role updates or deletes it and it has no updated_at trigger.
grant select, insert on edition_document_versions to opos_app;
--> statement-breakpoint
alter table edition_document_versions enable row level security;
--> statement-breakpoint
alter table edition_document_versions force row level security;
--> statement-breakpoint
create policy tenant_isolation on edition_document_versions
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint

-- A consent: its sentence, its place, whether it is required and hidden, and the document it
-- links, which the foreign key keeps inside the consent's own tenant and edition.
grant select, insert, delete on edition_consents to opos_app;
--> statement-breakpoint
grant update (document_id, text, is_required, position, hidden_at) on edition_consents to opos_app;
--> statement-breakpoint
alter table edition_consents enable row level security;
--> statement-breakpoint
alter table edition_consents force row level security;
--> statement-breakpoint
create policy tenant_isolation on edition_consents
  using (tenant_id = (select current_setting('app.tenant_id')::uuid))
  with check (tenant_id = (select current_setting('app.tenant_id')::uuid));
--> statement-breakpoint
create trigger edition_consents_set_updated_at
  before update on edition_consents
  for each row execute function public.set_updated_at();
--> statement-breakpoint

-- The sweep, the API's own job, tells a version's file from one nothing points at.
grant select (file_id) on edition_document_versions to opos_app_global;
--> statement-breakpoint

-- Two foreign keys without a cascade, checked when the transaction ends and not after each
-- statement. An edition goes with everything it owns along several paths at once: its documents
-- and its consents, its versions and their files. Checked at once, the key of whichever row goes
-- second would refuse the edition's own deletion. Checked at the end, it refuses only what it is
-- there for: a document a consent still links, and a file a version still points at.
alter table edition_consents
  alter constraint edition_consents_document_fk deferrable initially deferred;
--> statement-breakpoint
alter table edition_document_versions
  alter constraint edition_document_versions_file_fk deferrable initially deferred;
