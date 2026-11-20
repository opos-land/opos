ALTER TABLE "order_emails" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
-- An email of an order is written when it is sent, from the order as it then stands. One that
-- would hand the order over, with its QR code and a link, to an address the order has left since
-- it was queued is withdrawn instead: the outbox marks it, and passes it by from then on.
grant update (withdrawn_at) on order_emails to opos_app;
--> statement-breakpoint
grant select (withdrawn_at) on order_emails to opos_app_global;
