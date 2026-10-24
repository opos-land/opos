-- No endpoint creates a membership yet; the migration of the invitations endpoint (PLAN.md 7.7)
-- grants opos_app insert on tenant_memberships.
revoke insert on tenant_memberships from opos_app;
