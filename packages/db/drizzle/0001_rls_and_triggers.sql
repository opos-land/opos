-- Runtime privileges (PLAN.md 4.6). anon and authenticated get nothing.
grant select, insert, update, delete on accounts, tenants, tenant_memberships, editions, edition_memberships to opos_app, opos_app_global;
--> statement-breakpoint
revoke all on accounts, tenants, tenant_memberships, editions, edition_memberships from anon, authenticated;
--> statement-breakpoint

-- Tenant isolation. current_setting without missing_ok: a missing tenant context raises an error.
alter table tenants enable row level security;
--> statement-breakpoint
alter table tenants force row level security;
--> statement-breakpoint
create policy tenant_isolation on tenants
  using (id = current_setting('app.tenant_id')::uuid)
  with check (id = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
alter table tenant_memberships enable row level security;
--> statement-breakpoint
alter table tenant_memberships force row level security;
--> statement-breakpoint
create policy tenant_isolation on tenant_memberships
  using (tenant_id = current_setting('app.tenant_id')::uuid)
  with check (tenant_id = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
alter table editions enable row level security;
--> statement-breakpoint
alter table editions force row level security;
--> statement-breakpoint
create policy tenant_isolation on editions
  using (tenant_id = current_setting('app.tenant_id')::uuid)
  with check (tenant_id = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
alter table edition_memberships enable row level security;
--> statement-breakpoint
alter table edition_memberships force row level security;
--> statement-breakpoint
create policy tenant_isolation on edition_memberships
  using (tenant_id = current_setting('app.tenant_id')::uuid)
  with check (tenant_id = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint

-- updated_at follows every update, whatever client issues it (PLAN.md 4).
create function public.set_updated_at() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
--> statement-breakpoint
create trigger accounts_set_updated_at
  before update on accounts
  for each row execute function public.set_updated_at();
--> statement-breakpoint
create trigger tenants_set_updated_at
  before update on tenants
  for each row execute function public.set_updated_at();
--> statement-breakpoint
create trigger tenant_memberships_set_updated_at
  before update on tenant_memberships
  for each row execute function public.set_updated_at();
--> statement-breakpoint
create trigger editions_set_updated_at
  before update on editions
  for each row execute function public.set_updated_at();
--> statement-breakpoint
create trigger edition_memberships_set_updated_at
  before update on edition_memberships
  for each row execute function public.set_updated_at();
--> statement-breakpoint

-- accounts mirrors auth.users (PLAN.md 4.2). Owned by opos_migrator, so the functions write
-- accounts with its privileges when Supabase Auth inserts or updates a user.
create function public.handle_auth_user_created() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name text := nullif(trim(meta ->> 'full_name'), '');
  space_at int := coalesce(position(' ' in full_name), 0);
begin
  insert into public.accounts (id, email, first_name, last_name, locale)
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(trim(meta ->> 'first_name'), ''),
      case when space_at > 0 then left(full_name, space_at - 1) else full_name end
    ),
    coalesce(
      nullif(trim(meta ->> 'last_name'), ''),
      case when space_at > 0 then nullif(trim(substr(full_name, space_at + 1)), '') end
    ),
    nullif(trim(meta ->> 'locale'), '')
  );
  return new;
end;
$$;
--> statement-breakpoint
create function public.handle_auth_user_email_updated() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  update public.accounts set email = lower(new.email) where id = new.id;
  return new;
end;
$$;
--> statement-breakpoint
create trigger opos_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_auth_user_created();
--> statement-breakpoint
create trigger opos_on_auth_user_email_updated
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_auth_user_email_updated();
--> statement-breakpoint

-- At least one head per tenant (PLAN.md 4.5). Deferred to commit, so a head can be handed over
-- in either order inside one transaction, and a tenant is created together with its first head;
-- deleting the tenant itself is allowed. The check locks the tenant row first, so two
-- transactions demoting different heads of one tenant run it one after the other.
create function public.ensure_tenant_keeps_head() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.tenants where id = old.tenant_id for no key update;
  if found and not exists (
    select 1 from public.tenant_memberships where tenant_id = old.tenant_id and role = 'head'
  )
  then
    raise exception 'tenant % must keep at least one head', old.tenant_id
      using errcode = 'check_violation', constraint = 'tenant_memberships_at_least_one_head';
  end if;
  return null;
end;
$$;
--> statement-breakpoint
create constraint trigger tenant_memberships_at_least_one_head
  after update of role, tenant_id or delete on tenant_memberships
  deferrable initially deferred
  for each row when (old.role = 'head')
  execute function public.ensure_tenant_keeps_head();
--> statement-breakpoint
create function public.ensure_tenant_has_head() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.tenants where id = new.id)
    and not exists (
      select 1 from public.tenant_memberships where tenant_id = new.id and role = 'head'
    )
  then
    raise exception 'tenant % must be created with a head', new.id
      using errcode = 'check_violation', constraint = 'tenants_at_least_one_head';
  end if;
  return null;
end;
$$;
--> statement-breakpoint
create constraint trigger tenants_at_least_one_head
  after insert on tenants
  deferrable initially deferred
  for each row execute function public.ensure_tenant_has_head();
--> statement-breakpoint
revoke execute on function public.set_updated_at(), public.handle_auth_user_created(), public.handle_auth_user_email_updated(), public.ensure_tenant_keeps_head(), public.ensure_tenant_has_head() from public;
