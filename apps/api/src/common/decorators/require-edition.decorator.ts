import { SetMetadata } from '@nestjs/common'
import { type Level } from '../als/tenant-context.service'
import { type EditionResource, type Requirement } from '../permissions/permissions'
import { TENANT_REQUIREMENT } from './require-tenant.decorator'

/** A tenant route that also needs an edition-level permission on the `:editionId` of the path. */
export const RequireEdition = (resource: EditionResource, level: Level, param = 'editionId') =>
  SetMetadata(TENANT_REQUIREMENT, { kind: 'edition', resource, level, param } satisfies Requirement)
