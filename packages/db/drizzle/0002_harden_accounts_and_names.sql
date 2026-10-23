-- A rename keeps the existing constraint: no drop, no revalidation of every row.
ALTER TABLE "edition_memberships" RENAME CONSTRAINT "edition_memberships_membership_fk" TO "edition_memberships_tenant_membership_fk";--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_email_lowercase" CHECK ("accounts"."email" = lower("accounts"."email"));
