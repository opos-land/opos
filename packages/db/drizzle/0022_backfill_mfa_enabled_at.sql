-- Fills accounts.mfa_enabled_at for the accounts that held a verified factor before the
-- auth.mfa_factors trigger existed (PLAN.md 4.2, invariant 12). Only reads auth; the rows already
-- set keep their time.
update public.accounts a set mfa_enabled_at = now()
  where a.mfa_enabled_at is null
    and exists (
      select 1 from auth.mfa_factors f where f.user_id = a.id and f.status = 'verified'
    );
