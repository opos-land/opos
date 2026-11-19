import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { Skeleton } from '../../../shared/ui'
import { useCurrentTenant } from '../../tenants'
import { merchandiseFileOptions } from '../api/catalog'

/**
 * A picture or a size chart of the edition's merchandise in its small size. The file is read with
 * the member's session, since a hidden item's pictures are for the edition's orgs alone, and
 * shown from the browser's own copy of it. Its place is held by its proportions until it loads.
 */
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
  const file = useQuery({
    ...merchandiseFileOptions(api, editionId, fileId, 'small'),
    // A file never changes: its identifier names the same bytes for as long as it is there.
    staleTime: Infinity,
  })
  const body = file.data?.body
  // The browser's own address of the bytes just read, given back once another takes its place.
  const url = useMemo(() => (body ? URL.createObjectURL(body) : undefined), [body])
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )

  const box = { aspectRatio: `${width} / ${height}` }
  if (!url) return <Skeleton role="img" aria-label={alt} className="w-32" style={box} />
  return <img src={url} alt={alt} className="w-32 rounded-md border" style={box} />
}
