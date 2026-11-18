# Image variants

- Status: Draft
- Domain owner: the team: image variants are part of the core
- Decisions:
  [0035](../adr/0035-keep-a-cleaned-master-of-an-image-and-make-its-variants-in-imgproxy.md)

## Goal

An image somebody uploads reaches a screen as that screen needs it: small enough for a phone,
upright, and without what a camera wrote into it. [File storage](0012-file-storage.md) keeps
files and knows nothing of pictures; this spec says what is kept of an image and how the sizes a
feature shows are made, for every feature that takes images: the pictures of merchandise first,
and after them an account's picture, an edition's photographs, a picture in a comment. It is built
with file storage and before the first feature that shows pictures, the
[catalog](0003-catalog.md).

## Business rules

Every rule is the team's; none comes from a brief.

### The master

| #   | Rule                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | An uploaded image is kept as its master: the picture itself, upright, in sRGB, its longer side at most 4096 pixels. The file as it came is not kept.    |
| M2  | A master carries nothing a camera or a program wrote beside the picture: no place, no time, no device, no copyright field, no embedded thumbnail.       |
| M3  | A master keeps the format the image came in, and its transparency. An animated image is kept as its first frame.                                        |
| M4  | An image of more than 50 megapixels, and one that cannot be read as the image its type says, is refused when it is uploaded, and nothing of it is kept. |
| M5  | The master is made when the image is uploaded, before its file is kept.                                                                                 |

### Variants

| #   | Rule                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | A feature that shows images declares the variants of each of its kinds in its own spec: a name, the box it fits, and whether the picture is fitted inside the box or cropped to fill it. |
| V2  | A kind has up to eight variants. No variant is larger than its master, and none enlarges a picture. Every variant is WebP.                                                               |
| V3  | A variant is made from the master the first time it is asked for, and then kept: it is made once.                                                                                        |
| V4  | A kind may name variants to be made with the upload, so that nobody waits for the ones a page shows first.                                                                               |
| V5  | A variant never changes. A feature that wants another size declares a variant of another name.                                                                                           |
| V6  | A crop is taken from the middle of the picture.                                                                                                                                          |

### Serving

| #   | Rule                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | A browser gets a variant, never a master and never the file as it came. A feature's route that serves an image names the variant, and an undeclared one is not found. |
| S2  | A kept variant is served and cached as any file of file storage is.                                                                                                   |
| S3  | A feature gives an image's width and height with it, so that a page keeps the picture's place before it loads.                                                        |

### The image server

| #   | Rule                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | Images are read and written by an image server, imgproxy, in a container of its own. No image is decoded in the API's process.                                                                                          |
| I2  | Only the API reaches the image server, and it serves only what the API signed. The API asks it for a master and for declared variants, and for nothing else.                                                            |
| I3  | The image server holds no key of the bucket: it reads through an address the API signed for one object and for a minute.                                                                                                |
| I4  | With the image server out of reach an image is refused when it is uploaded, and a variant not yet made answers as unavailable. A file that is no image is kept all the same, and a kept variant is served all the same. |

## Shape

### Making a master

File storage's `receive` hands an upload of a kind of images to this module, outside every
transaction. The upload is stored under its file's key; the image server reads it and answers the
master; the master is stored, with the variants its kind makes with the upload; the upload is
removed. The image server reading the image is the check of its content. The file's row then
holds the master's type, size, checksum, width and height.

A route that takes an image refuses, beside what file storage names, with `images.unavailable`;
an image that cannot be read is `file.type-refused`, one over the limit of M4 `file.too-large`.

### Making a variant

File storage's `open` takes a variant's name for an image. A kept variant is answered from the
bucket. One not yet made is asked of the image server, stored beside the master and answered;
two first requests at once make it twice and keep the same bytes. Reading a variant writes
nothing to the database.

The registry of kinds holds each kind's variants. The sweep of file storage takes every object
under a file's key as that file's, and removes a variant no kind declares.

### The image server

imgproxy runs as one container, its image pinned by its digest, beside the API in every
environment; `pnpm infra:up` starts it on the local stack, and the `check` and `e2e` jobs of CI
start it the same way. It is configured to:

| Setting                | Value                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| requests               | signed ones alone, with a key and a salt the API shares                                              |
| sources                | the bucket's address alone                                                                           |
| metadata               | removed, copyright fields included                                                                   |
| orientation and colour | rotated by the recorded orientation; the colour profile turned into sRGB and removed                 |
| limits                 | a source of at most 50 megapixels; one frame of an animation; a result of at most 4096 pixels a side |

The size, the fit and the format of what it makes come with each signed request: the API builds
them from a kind's declaration, never from a request's input. The API's environment holds the
image server's address, key and salt, named in its `.env.example` and filled locally by
`pnpm infra:init`. The address the image server reads from is signed by the API with the bucket's
key, for one read and 60 seconds.

### Routes and screens

None of its own. A feature's route that serves an image takes the variant's name in its path. The
shared file control of the panel and of the portal shows an image by a variant its kind declares.

### Seed

None of its own.

## Tenant isolation and permissions

- The image server knows no tenant and no account, holds no key of the bucket and reaches no
  database. It reads one object, by an address the API built from the owner in its own context,
  and answers the API alone.
- It is reached from the API's network only: the reverse proxy publishes no address of it, and it
  refuses a request the API did not sign and a source outside the bucket.
- A master and its variants lie under their file's key, so under their owner's.
- No browser reaches the bucket: a signed address goes from the API to the image server and
  nowhere else, and no log line holds it.
- Who may see an image is the feature's rule, judged before a variant is opened: a variant not
  yet made is made only for a request that may read it.

These sentences of the documents change with the code: in ARCHITECTURE.md, the parts of the
system, which gain the image server; the environments; the checklist for adding a feature, which
gains the variants of a kind of images. In PRODUCT.md, section 10, which says an uploaded image is
kept without the data a camera wrote into it.

## Tests

Integration, in `apps/api/test`, against the local gateway and the image server, through a kind
of images declared for the tests:

- A photograph with a place, a copyright field and a sideways orientation: the master is upright,
  within 4096 pixels, in the format it came in and carries no metadata; the upload is gone from
  the bucket; the row holds the master's size and dimensions.
- A variant fitted inside its box and one cropped to fill it, each within its box, WebP and
  without metadata; an image smaller than the box is not enlarged; a PNG's transparency is kept;
  an animated image is one frame.
- A variant made with the upload is in the bucket before the first read. Any other is not, is
  made by its first read, and is answered from the bucket by the second, with the image server
  stopped.
- Two first reads at the same moment both answer the variant.
- An undeclared variant, and a variant of another tenant's or another account's image, are not
  found, and the image server is not asked.
- Refused, with nothing kept: a content that is not the image its type says, an image over 50
  megapixels.
- The image server out of reach: an image answers `images.unavailable` and nothing is kept; a PDF
  is kept; a kept variant is served; one not yet made answers as unavailable.
- The image server refuses an unsigned request and a source outside the bucket.
- The sweep removes the objects of an upload whose transaction did not commit, and a variant no
  kind declares.
- No log line holds a signed address.

e2e: none of its own; the scenarios of the features that show images cover it.

## Out of scope

- A size or a format chosen in an address; AVIF, and a format chosen by what a browser accepts.
- A crop a person chooses, a focus point, a watermark.
- Images in formats the storage does not take, such as HEIC.
- Compressing an image in the browser before it is sent.
- A browser sending an image straight to the bucket, and making masters in a queue.
- A cache, a CDN or an origin of its own in front of images.
- Who may upload a picture of a person and how one is taken down: the feature's spec.

## Open questions

- **Proposed values to confirm:** 4096 pixels a master (M1), 50 megapixels (M4), eight variants a
  kind (V2), WebP for every variant.
- **The master's format (M3):** kept as it came, as written, so that a drawing stays sharp; or
  always one format.
- **Test images:** small ones made by a tool for the tests, with a place and an orientation
  written into them; whether the rule against generated graphics allows such files in the
  repository.
- **The domain owner:** the team, as written, or a named owner of the core.
