export const migrationUrl = () =>
  process.env.DATABASE_MIGRATION_URL ??
  `postgres://opos_migrator:opos@localhost:${process.env.OPOS_DB_PORT ?? '5432'}/postgres`
