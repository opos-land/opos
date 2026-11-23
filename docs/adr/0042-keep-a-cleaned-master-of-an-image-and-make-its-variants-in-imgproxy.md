# 0042. Keep a cleaned master of an image and make its variants in imgproxy

- Status: Proposed
- Date: 2026-11-18

## Context

File storage keeps an uploaded file as it came, up to 15 MB
([0041](0041-keep-uploaded-files-in-an-s3-bucket-behind-the-api.md)). A photograph from a phone
that large is too heavy to show on a phone, and it carries what the camera wrote into it: where
and when it was taken, on what device, sometimes turned on its side.

The first images are an org's pictures of merchandise ([catalog](../specs/0003-catalog.md)). More
uses follow, each with sizes of its own: an account's picture, an edition's photographs, a picture
in a comment. A size nobody planned for can be made only from something kept.

Decoding an image is where a crafted file does harm, and the API's process holds the database's
connection and every secret. The frontends talk to the API alone, and no CDN stands in front of
it.

## Decision

- An uploaded image is kept as a master: re-encoded, upright, in sRGB, without metadata, at most
  4096 pixels a side. The file as it came is removed.
- A feature declares the variants of its kinds of image, as it declares the kinds. A variant is
  made from the master the first time it is asked for, or with the upload where its kind says so,
  and is then kept in the bucket beside the master.
- imgproxy makes the master and the variants: its open-source edition, in a container of its own
  beside the API in every environment, on the local stack and in CI.
- Only the API reaches imgproxy, with signed requests it builds from a kind's declaration.
  imgproxy holds no key of the bucket: the API signs an address for one read and a minute.
- A browser gets a kept variant through the API, as it gets any file.

The rules are in [the spec of image variants](../specs/0013-image-variants.md) until the feature
is built.

## Alternatives

- **Two fixed variants for every image, and no master.** The least to keep, but an account's
  picture or a photograph of an edition needs a size that could no longer be made.
- **The file as it came as the master.** No second encoding, but a place and a device at rest in
  the bucket and in its backups, and up to 15 MB a picture.
- **Any size named in an address.** No declaration needed, but work without a bound for whoever
  asks, and nothing that can be kept for good.
- **A cache in front in place of kept variants.** imgproxy's own advice, but one more layer to
  run, or its paid edition.
- **A library in the API's process** (sharp). No container to run, but images are decoded where
  the secrets are, and the API's image gains a native dependency.
- **imagor.** Its open-source edition keeps results by itself. The API keeps them instead, in the
  bucket it already owns; imgproxy removes metadata, applies the orientation and limits a
  source's size by default, and a company maintains it.
- **An image CDN** (Cloudflare Images, Bunny Optimizer, Cloudinary). Nothing to run, but pictures
  go through another vendor and come from another origin, against the BFF boundary and the
  portal's rule on other origins.
- **imgproxy reading the bucket with a key of its own.** imgproxy's own way, but a second secret
  to make and rotate in every environment, where a signed address needs none.

## Consequences

- One more container in every environment, on the local stack and in CI, with a key and a salt
  the API shares.
- An image can be uploaded, and a variant first made, only while imgproxy answers. Nothing else
  waits for it, and a kept variant is served without it.
- The first reader of a variant waits for it to be made, unless its kind makes it with the upload.
- A master is encoded once more than the file that came, and a variant once more than its master.
- The bucket holds a master for every image beside its variants.
- A variant never changes, so another size is a variant of another name, and an old name's
  objects go with the sweep.
- Not decided here, and due when people other than orgs upload pictures: a browser sending a file
  straight to the bucket, masters made in a queue, an origin of its own for files, and how a
  picture of a person is taken down.

## Sources

- imgproxy's documentation: its configuration options, signing and sources.
- The OWASP File Upload Cheat Sheet, on re-encoding an image and removing its metadata.
