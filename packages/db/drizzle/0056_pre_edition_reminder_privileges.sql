-- The pre-edition reminder (docs/specs/0011-pre-edition-reminder.md). No table is new: an
-- edition's shop keeps how many days before the edition the reminder goes out, the opening hours
-- it tells and when it went out.

-- An org with the tickets permission of the edition sets the first two; the API's job sets the
-- third as it queues the reminder, in the edition's own tenant transaction.
grant update (reminder_days_before, opening_hours, reminder_sent_at) on edition_shops to opos_app;
--> statement-breakpoint

-- The job finds the editions whose reminder is due across tenants: by the days set and whether
-- it went out, with the identifiers that open the tenant's transaction. Everything else of a
-- shop, and every order, is read inside that transaction.
grant select (tenant_id, edition_id, reminder_days_before, reminder_sent_at)
  on edition_shops to opos_app_global;
