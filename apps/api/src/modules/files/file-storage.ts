import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { type Env } from '../../config/env'
import { storageUnavailable } from './errors'

/** An object of the bucket as a listing shows it. */
export interface ListedObject {
  key: string
  lastModified: Date
}

/** How long imgproxy may use an address the API signed, in seconds. */
export const READ_URL_SECONDS = 60

/**
 * The bucket, behind the API alone (docs/specs/0012-file-storage.md). Every failure of the bucket
 * is `storage.unavailable`; an object that is not there is null.
 */
export abstract class FileStorage {
  abstract put(key: string, bytes: Uint8Array, type: string): Promise<void>
  abstract get(key: string): Promise<{ bytes: Uint8Array; type: string } | null>
  abstract list(prefix: string): AsyncIterable<ListedObject>
  abstract remove(keys: readonly string[]): Promise<void>
  /** An address imgproxy reads one object at, for a minute; it goes nowhere else. */
  abstract readUrl(key: string): Promise<string>
}

/** What a failure says in the log: its name alone, never an address or a key. */
const reasonOf = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message.split('\n')[0]}` : String(error)

/** The bucket spoken to through the AWS SDK. */
export class S3FileStorage extends FileStorage {
  private readonly client: S3Client
  private readonly signer: S3Client
  private readonly bucket: string

  constructor(env: Env) {
    super()
    const config = {
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
      // An S3-compatible bucket takes the checksums S3 itself asks for, and no others.
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
      maxAttempts: 2,
    }
    this.client = new S3Client({
      ...config,
      endpoint: env.S3_ENDPOINT,
      requestHandler: { connectionTimeout: 3000, requestTimeout: 30_000 },
    })
    // Signs the addresses imgproxy reads, at the bucket's address on imgproxy's network; it sends
    // nothing itself.
    this.signer = new S3Client({ ...config, endpoint: env.IMGPROXY_BUCKET_ENDPOINT })
    this.bucket = env.S3_BUCKET
  }

  private async send<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      throw storageUnavailable(reasonOf(error))
    }
  }

  put(key: string, bytes: Uint8Array, type: string) {
    return this.send(async () => {
      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: type }),
      )
    })
  }

  async get(key: string) {
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      const bytes = await object.Body!.transformToByteArray()
      return { bytes, type: object.ContentType ?? 'application/octet-stream' }
    } catch (error) {
      if (error instanceof NoSuchKey) return null
      throw storageUnavailable(reasonOf(error))
    }
  }

  async *list(prefix: string): AsyncIterable<ListedObject> {
    let token: string | undefined
    do {
      const page = await this.send(() =>
        this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        ),
      )
      for (const object of page.Contents ?? []) {
        if (object.Key && object.LastModified) {
          yield { key: object.Key, lastModified: object.LastModified }
        }
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
  }

  async remove(keys: readonly string[]) {
    for (let at = 0; at < keys.length; at += 1000) {
      const batch = keys.slice(at, at + 1000)
      await this.send(() =>
        this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        ),
      )
    }
  }

  readUrl(key: string) {
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: READ_URL_SECONDS,
    })
  }
}
