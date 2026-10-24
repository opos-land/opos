-- accounts.email_confirmed_at mirrors auth.users.email_confirmed_at (PLAN.md 4.2): matching an
-- account by email counts only a confirmed one. Supabase Auth confirms an address with an update,
-- also right after the insert of a user created already confirmed.
create or replace function public.handle_auth_user_created() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name text := nullif(trim(meta ->> 'full_name'), '');
  space_at int := coalesce(position(' ' in full_name), 0);
begin
  insert into public.accounts (id, email, email_confirmed_at, first_name, last_name, locale)
  values (
    new.id,
    lower(new.email),
    new.email_confirmed_at,
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
create function public.handle_auth_user_email_confirmed() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  update public.accounts set email_confirmed_at = new.email_confirmed_at where id = new.id;
  return new;
end;
$$;
--> statement-breakpoint
create trigger opos_on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is distinct from new.email_confirmed_at)
  execute function public.handle_auth_user_email_confirmed();
--> statement-breakpoint
revoke execute on function public.handle_auth_user_email_confirmed() from public;
