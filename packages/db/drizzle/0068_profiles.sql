CREATE TYPE "public"."profile_interest" AS ENUM('tabletop-rpg', 'larp', 'board-games', 'card-games', 'miniature-wargames', 'video-games', 'literature', 'comics', 'manga-anime', 'film-tv', 'cosplay', 'crafts');--> statement-breakpoint
CREATE TYPE "public"."profile_report_reason" AS ENUM('identity', 'offensive', 'spam', 'other');--> statement-breakpoint
CREATE TABLE "account_avatars" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_profiles" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"published_at" timestamp with time zone,
	"taken_down_at" timestamp with time zone,
	"taken_down_reason" "profile_report_reason",
	"taken_down_note" text,
	"taken_down_after_report" boolean,
	"review_requested_at" timestamp with time zone,
	"description" text,
	"pronouns" text,
	"city" text,
	"links" text[] DEFAULT '{}'::text[] NOT NULL,
	"interests" "profile_interest"[] DEFAULT '{}'::profile_interest[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_profiles_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "account_profiles_public_or_taken_down" CHECK ("account_profiles"."published_at" is null or "account_profiles"."taken_down_at" is null),
	CONSTRAINT "account_profiles_takedown" CHECK (case
        when "account_profiles"."taken_down_at" is null
          then "account_profiles"."taken_down_reason" is null and "account_profiles"."taken_down_note" is null
            and "account_profiles"."taken_down_after_report" is null and "account_profiles"."review_requested_at" is null
        else "account_profiles"."taken_down_reason" is not null and "account_profiles"."taken_down_reason" <> 'other'
          and "account_profiles"."taken_down_after_report" is not null
      end),
	CONSTRAINT "account_profiles_takedown_note" CHECK (char_length("account_profiles"."taken_down_note") between 1 and 500),
	CONSTRAINT "account_profiles_description" CHECK (char_length("account_profiles"."description") between 1 and 500),
	CONSTRAINT "account_profiles_pronouns" CHECK (char_length("account_profiles"."pronouns") between 1 and 30),
	CONSTRAINT "account_profiles_city" CHECK (char_length("account_profiles"."city") between 1 and 80),
	CONSTRAINT "account_profiles_links" CHECK (cardinality("account_profiles"."links") <= 3
        and array_position("account_profiles"."links", null) is null
        and array_to_string("account_profiles"."links", '') !~ '\s'
        and (cardinality("account_profiles"."links") = 0
          or array_to_string("account_profiles"."links", E'\n') ~ '^https://\S{1,192}(\nhttps://\S{1,192})*$')),
	CONSTRAINT "account_profiles_interests" CHECK (cardinality("account_profiles"."interests") <= 12 and array_position("account_profiles"."interests", null) is null)
);
--> statement-breakpoint
CREATE TABLE "profile_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"reason" "profile_report_reason" NOT NULL,
	"note" text,
	"email" text,
	"locale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "profile_reports_note" CHECK (char_length("profile_reports"."note") between 1 and 1000),
	CONSTRAINT "profile_reports_email" CHECK (("profile_reports"."email" is null) = ("profile_reports"."locale" is null) and char_length("profile_reports"."email") between 3 and 320)
);
--> statement-breakpoint
-- Before the pointer at an avatar: its foreign key names a file with its account.
ALTER TABLE "account_files" ADD CONSTRAINT "account_files_id_account_unique" UNIQUE("id","account_id");--> statement-breakpoint
ALTER TABLE "account_avatars" ADD CONSTRAINT "account_avatars_profile_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account_profiles"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_avatars" ADD CONSTRAINT "account_avatars_file_fk" FOREIGN KEY ("file_id","account_id") REFERENCES "public"."account_files"("id","account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_profiles" ADD CONSTRAINT "account_profiles_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_reports" ADD CONSTRAINT "profile_reports_profile_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account_profiles"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_reports_open_idx" ON "profile_reports" USING btree ("account_id") WHERE "profile_reports"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "profile_reports_closed_at_idx" ON "profile_reports" USING btree ("closed_at");
