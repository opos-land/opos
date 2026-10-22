-- From Supabase's self-hosting setup (docker/volumes/db/jwt.sql).
-- Runs as postgres from /docker-entrypoint-initdb.d/init-scripts on an empty data directory.
\set jwt_exp `echo "$JWT_EXP"`

alter database postgres set "app.settings.jwt_exp" to :'jwt_exp';
