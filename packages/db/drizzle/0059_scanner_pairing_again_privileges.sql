-- A scanner is given a new pairing code (docs/specs/0007-scanner.md, D14): the hash of the code
-- and the moment it stops working change with it, beside the pairing and the token, which the
-- application role already empties. What a scanner was enabled with stays beyond the role: its
-- name, its end, its edition and the org behind it.
grant update (pairing_code_hash, pairing_expires_at) on scanner_devices to opos_app;
