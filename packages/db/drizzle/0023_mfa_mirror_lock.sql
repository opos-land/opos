-- The mirror of auth.mfa_factors locks the account first (PLAN.md 4.2, invariant 12). Two
-- transactions that remove two verified factors of one account would otherwise each still see the
-- other's factor and leave mfa_enabled_at set; with the lock, the later one reads the earlier
-- one's commit. Same pattern as invariant 2.
create or replace function public.opos_handle_mfa_factor_change() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := case tg_op when 'DELETE' then old.user_id else new.user_id end;
  verified boolean;
begin
  perform 1 from public.accounts where id = account_id for no key update;
  select exists (
    select 1 from auth.mfa_factors where user_id = account_id and status = 'verified'
  ) into verified;
  update public.accounts
    set mfa_enabled_at = case when verified then now() end
    where id = account_id and (mfa_enabled_at is not null) is distinct from verified;
  return null;
end;
$$;
