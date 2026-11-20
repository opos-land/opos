-- What an email of an order said is kept as it is sent
-- (docs/specs/0006-order-management.md, F4): the outbox writes its subject and its text as it
-- marks the email sent. The application role reads them within its tenant, as it reads the rest
-- of the row. The role that works across tenants is granted neither column: the text names its
-- buyer, and the outbox finds an email by identifiers alone.
grant update (subject, body) on order_emails to opos_app;
