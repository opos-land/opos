-- Buyer self-service (docs/specs/0009-buyer-self-service.md). No table is new: an order names the
-- order it extends, which the API writes as the order is placed and never changes, and an edition
-- tells where and when merchandise is handed over.

-- An org with the tickets permission of the edition sets the pick-up information.
grant update (pickup_information) on edition_shops to opos_app;
--> statement-breakpoint

-- An order link comes with no tenant: it is looked up across tenants by the hash of its token,
-- and the lookup answers its tenant alone. The link, its order and whether it still opens are
-- read in that tenant's own transaction.
grant select (tenant_id, token_hash) on order_links to opos_app_global;
