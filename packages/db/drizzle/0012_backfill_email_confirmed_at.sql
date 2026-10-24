-- Fills accounts.email_confirmed_at for the accounts that existed before the auth.users triggers
-- mirrored it (PLAN.md 4.2). Only a database whose opos_migrator still reads auth.users can hold
-- such accounts: one created from the narrowed opos-roles.sql gets every account through the
-- triggers, and there the block does nothing.
do $$
begin
  if has_column_privilege('auth.users', 'id', 'SELECT')
    and has_column_privilege('auth.users', 'email_confirmed_at', 'SELECT') then
    update public.accounts a set email_confirmed_at = u.email_confirmed_at
      from auth.users u
      where u.id = a.id and a.email_confirmed_at is distinct from u.email_confirmed_at;
  end if;
end;
$$;
