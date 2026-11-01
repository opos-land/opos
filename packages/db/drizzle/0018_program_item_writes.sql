-- The programme routes (PLAN.md 5.5) create, change and delete items and replace their speakers.
grant insert, delete on program_items to opos_app;
--> statement-breakpoint
grant update (title, description, starts_at, ends_at) on program_items to opos_app;
--> statement-breakpoint
grant insert, delete on program_item_speakers to opos_app;
