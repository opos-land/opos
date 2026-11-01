-- Likes (PLAN.md 5.6) and the personal schedule, a cross-tenant read of the account's own likes
-- (PLAN.md 4.6). opos_app_global reads only the columns GET /me/schedule selects and joins on.
grant insert, delete on program_item_likes to opos_app;
--> statement-breakpoint
grant select (account_id, program_item_id) on program_item_likes to opos_app_global;
--> statement-breakpoint
grant select (id, edition_id, title, starts_at, ends_at) on program_items to opos_app_global;
--> statement-breakpoint
grant select (tenant_id, name, is_published) on editions to opos_app_global;
