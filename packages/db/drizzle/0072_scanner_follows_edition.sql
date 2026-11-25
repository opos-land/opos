-- A scanner whose org set no end follows its edition: its access ends a day after the edition's
-- last day, as that day stands whenever the end is read. Its row then holds no end.
ALTER TABLE "scanner_devices" ALTER COLUMN "expires_at" DROP NOT NULL;
--> statement-breakpoint

-- Until now every scanner was written an end when it was enabled, the default one when its org
-- set none. A row whose end equals that default of its edition as the edition stands today is
-- one that follows it from here on. An org who chose that very moment gets the same end, which
-- now moves with the edition.
update scanner_devices
set expires_at = null
from editions
where editions.id = scanner_devices.edition_id
  and editions.tenant_id = scanner_devices.tenant_id
  and scanner_devices.expires_at = editions.ends_at + interval '24 hours';
