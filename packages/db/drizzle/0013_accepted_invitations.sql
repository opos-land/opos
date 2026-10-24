CREATE TABLE "accepted_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"jti" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accepted_invitations_tenant_jti_unique" UNIQUE("tenant_id","jti")
);
--> statement-breakpoint
ALTER TABLE "accepted_invitations" ADD CONSTRAINT "accepted_invitations_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;