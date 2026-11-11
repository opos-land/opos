CREATE TYPE "public"."theme" AS ENUM('light', 'dark');--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "theme" "theme";