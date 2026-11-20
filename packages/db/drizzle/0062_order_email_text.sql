ALTER TABLE "order_emails" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "order_emails" ADD COLUMN "body" text;--> statement-breakpoint
CREATE INDEX "order_emails_edition_queued_idx" ON "order_emails" USING btree ("tenant_id","edition_id","queued_at");--> statement-breakpoint
ALTER TABLE "order_emails" ADD CONSTRAINT "order_emails_said" CHECK (("order_emails"."subject" is null) = ("order_emails"."body" is null));--> statement-breakpoint
ALTER TABLE "order_emails" ADD CONSTRAINT "order_emails_said_once_sent" CHECK ("order_emails"."body" is null or "order_emails"."sent_at" is not null);