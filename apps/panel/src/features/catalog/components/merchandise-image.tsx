import { useCurrentTenant } from '../../tenants'
import { merchandiseFileOptions } from '../api/catalog'
import { CatalogImage } from './catalog-image'

/** A picture or a size chart of the edition's merchandise in its small size. */
export function MerchandiseImage({
  editionId,
  fileId,
  width,
  height,
  alt,
}: {
  editionId: string
  fileId: string
  width: number
  height: number
  alt: string
}) {
  const { api } = useCurrentTenant()
  return (
    <CatalogImage
      file={merchandiseFileOptions(api, editionId, fileId, 'small')}
      width={width}
      height={height}
      alt={alt}
    />
  )
}
