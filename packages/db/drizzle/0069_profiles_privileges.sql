-- The rows of the public profile (docs/specs/0016-public-profile.md): an account's profile, the
-- pointer at its avatar and the reports of the profile. Global tables, as accounts is, with no
-- RLS, so their privileges are the database-side limit (docs/ARCHITECTURE.md, Tenant isolation).
revoke all on account_profiles, account_avatars, profile_reports from anon, authenticated, service_role, opos_app, opos_app_global, opos_admin;
--> statement-breakpoint
create trigger account_profiles_set_updated_at
  before update on account_profiles
  for each row execute function public.set_updated_at();
--> statement-breakpoint

-- The API keeps what the profile of the session's account holds, publishes it and asks for a
-- review. It gives no public identifier, sets nothing a takedown sets and deletes no profile, so
-- an account can neither end a takedown by itself nor start again under another identifier.
grant select on account_profiles to opos_app;
--> statement-breakpoint
grant insert (account_id, description, pronouns, city, links, interests, published_at) on account_profiles to opos_app;
--> statement-breakpoint
grant update (description, pronouns, city, links, interests, published_at, review_requested_at) on account_profiles to opos_app;
--> statement-breakpoint

-- The pointer at an avatar is added and removed, never changed: a replaced avatar is a new row.
grant select, insert, delete on account_avatars to opos_app;
--> statement-breakpoint

-- The API adds a report, counts the open ones of a profile for their limit and removes an old
-- closed one. It reads nothing a report says, the email address of who sent it included.
grant insert (account_id, reason, note, email, locale) on profile_reports to opos_app;
--> statement-breakpoint
grant select (account_id, closed_at) on profile_reports to opos_app;
--> statement-breakpoint
grant delete on profile_reports to opos_app;
--> statement-breakpoint

-- Anyone reads a published profile, outside every tenant
-- (docs/adr/0071-let-anyone-read-the-profile-an-account-published.md): the parts of the public
-- name, what the profile holds and the pointer at the avatar. Never an email address, and nothing
-- a takedown says.
grant select (id, first_name, last_name, nickname, name_order) on accounts to opos_app_global;
--> statement-breakpoint
grant select (account_id, public_id, published_at, description, pronouns, city, links, interests) on account_profiles to opos_app_global;
--> statement-breakpoint
grant select (account_id, file_id) on account_avatars to opos_app_global;
--> statement-breakpoint

-- The admin reads a profile and its reports, takes the profile down and restores it, removes its
-- avatar, closes a report and clears the three parts of an account's name. It changes nothing a
-- profile says.
grant select (nickname, name_order) on accounts to opos_admin;
--> statement-breakpoint
grant update (first_name, last_name, nickname) on accounts to opos_admin;
--> statement-breakpoint
grant select (account_id, public_id, published_at, taken_down_at, taken_down_reason, taken_down_note, taken_down_after_report, review_requested_at, description, pronouns, city, links, interests, created_at, updated_at) on account_profiles to opos_admin;
--> statement-breakpoint
grant update (published_at, taken_down_at, taken_down_reason, taken_down_note, taken_down_after_report, review_requested_at) on account_profiles to opos_admin;
--> statement-breakpoint
grant select (account_id, file_id, created_at) on account_avatars to opos_admin;
--> statement-breakpoint
grant delete on account_avatars to opos_admin;
--> statement-breakpoint
grant select (id, account_id, reason, note, email, locale, created_at, closed_at) on profile_reports to opos_admin;
--> statement-breakpoint
grant update (closed_at) on profile_reports to opos_admin;
