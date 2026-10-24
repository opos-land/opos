-- A head holds everything, so its tenant-level permissions stay at none (PLAN.md 4.5);
-- an existing head row may still hold the levels it had as an org.
update tenant_memberships set settings_access = 'none', branding_access = 'none', shop_config_access = 'none'
  where role = 'head'
    and (settings_access <> 'none' or branding_access <> 'none' or shop_config_access <> 'none');
--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_head_holds_no_levels" CHECK ("tenant_memberships"."role" = 'org' or ("tenant_memberships"."settings_access" = 'none' and "tenant_memberships"."branding_access" = 'none' and "tenant_memberships"."shop_config_access" = 'none'));