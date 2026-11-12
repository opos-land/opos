-- A tenant is suspended, restored and deleted by the admin, and the slug of a deleted tenant is
-- never a tenant's again (docs/adr/0031-suspend-a-tenant-before-deleting-it.md).

-- retired_tenant_slugs is global, like accounts, so it has no RLS. The triggers below write and
-- read it as their owner; no runtime role holds anything on it.
revoke all on retired_tenant_slugs from anon, authenticated, service_role, opos_app, opos_app_global, opos_admin;
--> statement-breakpoint

-- The slug of a deleted tenant is retired whoever deletes the tenant.
create function public.retire_tenant_slug() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.retired_tenant_slugs (slug) values (old.slug) on conflict do nothing;
  return null;
end;
$$;
--> statement-breakpoint
create trigger tenants_retire_slug
  after delete on tenants
  for each row execute function public.retire_tenant_slug();
--> statement-breakpoint

-- No tenant takes a retired slug. An insert or an update that meets a slug being deleted waits on
-- tenants_slug_unique for that deletion to commit; this runs after the wait, so it reads the slug
-- the deletion retired. That holds at READ COMMITTED alone: above it a transaction reads the
-- snapshot of its start and would miss a slug retired since, so such a transaction takes no slug.
create function public.ensure_tenant_slug_not_retired() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'a tenant takes a slug only in a read committed transaction'
      using errcode = 'feature_not_supported', constraint = 'tenants_slug_at_read_committed';
  end if;
  if exists (select 1 from public.retired_tenant_slugs where slug = new.slug) then
    raise exception 'the slug % belonged to a deleted tenant', new.slug
      using errcode = 'check_violation', constraint = 'tenants_slug_not_retired';
  end if;
  return null;
end;
$$;
--> statement-breakpoint
create trigger tenants_slug_not_retired
  after insert or update of slug on tenants
  for each row execute function public.ensure_tenant_slug_not_retired();
--> statement-breakpoint
revoke execute on function public.retire_tenant_slug(), public.ensure_tenant_slug_not_retired() from public, anon, authenticated, service_role;
--> statement-breakpoint

-- The API refuses a suspended tenant wherever it enters one, so its cross-tenant lookups read
-- whether a tenant is suspended.
grant select (suspended_at) on tenants to opos_app_global;
--> statement-breakpoint

-- opos_admin bypasses RLS, so these grants are its limit. It lists the tenants, creates one with
-- its first head, gives one a new slug, suspends and restores one, and deletes one; the name, the
-- locale and the time zone stay with the tenant's own organizers.
grant select (id, slug, name, default_locale, timezone, suspended_at, created_at) on tenants to opos_admin;
--> statement-breakpoint
grant insert, delete on tenants to opos_admin;
--> statement-breakpoint
grant update (slug, suspended_at) on tenants to opos_admin;
--> statement-breakpoint

-- The first head of a new tenant, and the heads of each tenant for the admin to reach.
grant select (id, tenant_id, account_id, role) on tenant_memberships to opos_admin;
--> statement-breakpoint
grant insert on tenant_memberships to opos_admin;
--> statement-breakpoint

-- The account a confirmed email address names as a first head, and the names of the heads.
grant select (id, email, first_name, last_name, email_confirmed_at) on accounts to opos_admin;
