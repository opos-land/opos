import { SetMetadata } from '@nestjs/common'

export const TAKES_FILE = Symbol('TAKES_FILE')
export const SERVES_FILE = Symbol('SERVES_FILE')

/** What a route that takes a file receives: the kind, and the field of its body holding it. */
export interface TakesFileOptions {
  kind: string
  field: string
}

/**
 * A tenant route at `write` that takes a file of `kind` in the `field` of its JSON body: after its
 * requirement is judged, the file is received outside every transaction, then the route's own
 * transaction keeps it through FilesService.keep(FilesService.received())
 * (docs/specs/0012-file-storage.md). Its contract route carries `takesFile`.
 */
export const TakesFile = (kind: string, field = 'file'): MethodDecorator =>
  SetMetadata(TAKES_FILE, { kind, field } satisfies TakesFileOptions)

/**
 * A tenant route that serves a file: its requirement is judged in a short transaction, then it
 * runs outside every transaction, reading its own rows through TenantContextService.withTenant and
 * the file through FilesService.open. Its contract route carries `servesFile`.
 */
export const ServesFile = (): MethodDecorator => SetMetadata(SERVES_FILE, true)
