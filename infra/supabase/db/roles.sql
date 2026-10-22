-- From Supabase's self-hosting setup (docker/volumes/db/roles.sql), reduced to the roles OPOS uses.
-- Runs as postgres from /docker-entrypoint-initdb.d/init-scripts on an empty data directory.
\set pgpass `echo "$POSTGRES_PASSWORD"`

alter user supabase_auth_admin with password :'pgpass';
