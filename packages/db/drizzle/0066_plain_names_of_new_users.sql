-- A name that comes with a new user, from the sign-up form or from Google, reaches accounts
-- through this mirror alone, where the API refuses nothing. It takes out the control characters
-- and the characters that turn the direction of the text, as PATCH /me refuses them
-- (docs/specs/0016-public-profile.md, N7).
create or replace function public.handle_auth_user_created() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  hidden constant text := '[\u0001-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]';
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name text := nullif(trim(regexp_replace(meta ->> 'full_name', hidden, '', 'g')), '');
  space_at int := coalesce(position(' ' in full_name), 0);
begin
  insert into public.accounts (id, email, email_confirmed_at, first_name, last_name, locale)
  values (
    new.id,
    lower(new.email),
    new.email_confirmed_at,
    coalesce(
      nullif(trim(regexp_replace(meta ->> 'first_name', hidden, '', 'g')), ''),
      case when space_at > 0 then left(full_name, space_at - 1) else full_name end
    ),
    coalesce(
      nullif(trim(regexp_replace(meta ->> 'last_name', hidden, '', 'g')), ''),
      case when space_at > 0 then nullif(trim(substr(full_name, space_at + 1)), '') end
    ),
    nullif(trim(meta ->> 'locale'), '')
  );
  return new;
end;
$$;
