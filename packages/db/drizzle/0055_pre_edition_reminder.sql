ALTER TABLE "edition_shops" ADD COLUMN "reminder_days_before" integer;--> statement-breakpoint
ALTER TABLE "edition_shops" ADD COLUMN "opening_hours" text;--> statement-breakpoint
ALTER TABLE "edition_shops" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "edition_shops" ADD CONSTRAINT "edition_shops_reminder_days_before" CHECK ("edition_shops"."reminder_days_before" between 1 and 60);--> statement-breakpoint
ALTER TABLE "edition_shops" ADD CONSTRAINT "edition_shops_opening_hours" CHECK (char_length("edition_shops"."opening_hours") <= 1000);