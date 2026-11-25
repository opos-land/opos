-- An attempt of an expired order nobody confirmed is asked about at its provider once more, and
-- marked when it was (docs/ARCHITECTURE.md, Modules waiting for their domain owner): the
-- application role writes that moment within its tenant, as it writes what a provider reports.
grant update (rechecked_at) on payment_attempts to opos_app;
--> statement-breakpoint

-- The read across tenants of the job that asks again (docs/ARCHITECTURE.md, Tenant isolation):
-- the attempts of expired orders nobody confirmed that were not asked about. It joins an attempt
-- to its order by the order's identifier and filters on the two moments; of the order it reads
-- the columns the expiry job already does. Nothing a provider said of a payment is granted.
grant select (order_id, confirmed_at, rechecked_at) on payment_attempts to opos_app_global;
