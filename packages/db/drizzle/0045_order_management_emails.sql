ALTER TYPE "public"."order_email_kind" ADD VALUE 'order-holder-changed';--> statement-breakpoint
ALTER TYPE "public"."order_email_kind" ADD VALUE 'order-variant-changed';--> statement-breakpoint
ALTER TYPE "public"."order_email_kind" ADD VALUE 'order-email-changed';--> statement-breakpoint
ALTER TYPE "public"."order_email_kind" ADD VALUE 'order-email-replaced';--> statement-breakpoint
ALTER TYPE "public"."order_email_kind" ADD VALUE 'order-declined';--> statement-breakpoint
ALTER TYPE "public"."order_email_kind" ADD VALUE 'order-canceled';