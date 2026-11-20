/** The address a shown merchandise item's picture or size chart is served from, without sign-in. */
export const merchandiseFileUrl = (
  apiUrl: string,
  tenantSlug: string,
  fileId: string,
  variant: 'small' | 'large',
) =>
  `${apiUrl.replace(/\/+$/, '')}/public/tenants/${tenantSlug}/merchandise-files/${fileId}/${variant}`

/** The address the picture of a shown add-on is served from, without sign-in. */
export const addOnFileUrl = (
  apiUrl: string,
  tenantSlug: string,
  fileId: string,
  variant: 'small' | 'large',
) => `${apiUrl.replace(/\/+$/, '')}/public/tenants/${tenantSlug}/add-on-files/${fileId}/${variant}`

/** The address a published version of an edition's document is served from, without sign-in. */
export const documentVersionUrl = (apiUrl: string, tenantSlug: string, versionId: string) =>
  `${apiUrl.replace(/\/+$/, '')}/public/tenants/${tenantSlug}/document-versions/${versionId}`
