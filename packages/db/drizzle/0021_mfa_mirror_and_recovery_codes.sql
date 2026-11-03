CREATE TABLE "account_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_recovery_codes_account_hash_unique" UNIQUE("account_id","code_hash")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "mfa_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_recovery_codes" ADD CONSTRAINT "account_recovery_codes_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Recovery codes of two-factor authentication (PLAN.md 4.2): global like accounts, so no RLS.
-- opos_app reads, inserts and deletes them and marks one used; opos_app_global reads none.
grant select, insert, delete on account_recovery_codes to opos_app;
--> statement-breakpoint
grant update (used_at) on account_recovery_codes to opos_app;
--> statement-breakpoint
revoke all on account_recovery_codes from anon, authenticated, service_role, opos_app_global;
--> statement-breakpoint
create trigger account_recovery_codes_set_updated_at
  before update on account_recovery_codes
  for each row execute function public.set_updated_at();
--> statement-breakpoint

-- accounts.mfa_enabled_at mirrors whether the user holds a verified factor (PLAN.md 4.2): set when
-- one appears, kept while another remains, cleared when the last goes. Owned by postgres, so the
-- function reads auth.mfa_factors and writes accounts as Supabase Auth changes a factor.
create function public.opos_handle_mfa_factor_change() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := case tg_op when 'DELETE' then old.user_id else new.user_id end;
  verified boolean;
begin
  select exists (
    select 1 from auth.mfa_factors where user_id = account_id and status = 'verified'
  ) into verified;
  update public.accounts
    set mfa_enabled_at = case when verified then now() end
    where id = account_id and (mfa_enabled_at is not null) is distinct from verified;
  return null;
end;
$$;
--> statement-breakpoint
create trigger opos_on_auth_mfa_factor_changed
  after insert or update of status or delete on auth.mfa_factors
  for each row execute function public.opos_handle_mfa_factor_change();
--> statement-breakpoint
revoke execute on function public.opos_handle_mfa_factor_change() from public;
