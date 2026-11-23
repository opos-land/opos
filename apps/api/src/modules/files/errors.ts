import { ApiError } from '../../common/errors/api-error'

/** The bytes are not what their type says, or the type is not the kind's. */
export const fileTypeRefused = () =>
  new ApiError(422, 'file.type-refused', 'The file is not of a type this kind of file takes')

/** Over the kind's limit, or an image of more than 50 megapixels. */
export const fileTooLarge = () => new ApiError(413, 'file.too-large', 'The file is too large')

/** The owner holds as many bytes as it may. */
export const fileLimitReached = () =>
  new ApiError(409, 'file.limit-reached', 'The owner of the file holds as much as it may')

/** The bucket is out of reach: nothing was kept, or the file cannot be read now. */
export const storageUnavailable = (reason: string) =>
  new ApiError(
    503,
    'storage.unavailable',
    'The storage of files is unavailable',
    undefined,
    { 'Retry-After': '30' },
    { expected: true, reason },
  )

/** imgproxy is out of reach: no image is taken, and a variant not yet made cannot be. */
export const imagesUnavailable = (reason: string) =>
  new ApiError(
    503,
    'images.unavailable',
    'The image server is unavailable',
    undefined,
    { 'Retry-After': '30' },
    { expected: true, reason },
  )
