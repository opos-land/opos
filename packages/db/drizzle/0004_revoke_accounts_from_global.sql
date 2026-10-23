-- No cross-tenant query (PLAN.md 4.6) reads accounts, so the RLS-bypassing role gets none of it.
revoke select on accounts from opos_app_global;
