-- A checkout sent again is answered with the order it placed and a new result token, which takes
-- the place of the one whose answer never arrived: the application role writes the hash of that
-- token on the order's row, within its tenant. The hash of the placement key itself is written
-- once, with the order, under the grants the table has: no role updates it, and the role that
-- works across tenants reads neither hash.
grant update (result_token_hash) on orders to opos_app;
