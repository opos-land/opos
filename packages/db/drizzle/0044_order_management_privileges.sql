-- Order management (docs/specs/0006-order-management.md): what an org corrects, cancels, settles
-- and hands out of an order. No table is new; these are the columns the API starts changing.

-- A correction changes the ticket holder's name and the order's email. A review has a cause, a
-- cancellation and a decline a moment and a reason. What the order is, costs and belongs to, and
-- what a manual order was recorded with, still never change.
grant update (holder_name, email, review_cause, canceled_at, cancel_reason, declined_at,
  decline_reason) on orders to opos_app;
--> statement-breakpoint

-- A line is handed over, and the mark may be taken back. A swap moves a merchandise line to
-- another variant: the one pointer of an order the API changes in place, since the line keeps its
-- price and its hand-out mark, and its foreign key keeps the variant within the item the line
-- names, in its own edition and tenant.
grant update (handed_out_at, merchandise_variant_id) on order_lines to opos_app;
--> statement-breakpoint

-- A changed email gives the order a new QR code: the old one is marked replaced, so the scanner
-- can say why it is refused, and the order lets go of it and takes the new one, a row removed
-- and a row added, never one changed.
grant update (replaced_at) on order_qr_codes to opos_app;
--> statement-breakpoint
grant delete on order_qr_code_orders to opos_app;
--> statement-breakpoint

-- The links sent before an email changed stop working.
grant update (ended_at) on order_links to opos_app;
