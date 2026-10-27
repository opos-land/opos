import { ApiError } from '../errors/api-error'
import { TENANT_WRITE_LOCK_TIMEOUT_MS } from './tenant-write-lock'

/** The answer to a write that waited too long for its tenant (PLAN.md 7.3). */
export const tenantBusy = (tenantId: string) =>
  new ApiError(
    503,
    'request.busy',
    `The writes of tenant ${tenantId} are busy`,
    undefined,
    { 'Retry-After': '1' },
    { expected: true },
  )

/**
 * Runs the writes of one tenant one after another, in arrival order, inside this process
 * (PLAN.md 7.3). A write waits here before it opens its transaction, so a queue of writes to a
 * busy tenant holds no database connection; past `timeoutMs` it gives up with 503 request.busy.
 * The tenant's advisory write lock stays the guarantee across processes.
 */
export class TenantWriteQueue {
  /** The promise each tenant's next write waits for: the end of the write queued last. */
  private readonly tails = new Map<string, Promise<void>>()

  /**
   * @param timeoutMs how long a write waits for its turn
   * @param maxTurnMs how long a write keeps its turn at most; one that hangs past it lets the next
   *   write go on, and the advisory lock still orders them in the database
   */
  constructor(
    private readonly timeoutMs = TENANT_WRITE_LOCK_TIMEOUT_MS,
    private readonly maxTurnMs = 6 * TENANT_WRITE_LOCK_TIMEOUT_MS,
  ) {}

  /**
   * Runs `write` in its tenant's turn. The turn ends when `write` settles or calls the `release`
   * it gets, whichever comes first: a write releases it when its transaction ends, so the steps
   * after the commit run while the next write already goes ahead.
   */
  async run<T>(tenantId: string, write: (release: () => void) => Promise<T>): Promise<T> {
    const previous = this.tails.get(tenantId) ?? Promise.resolve()
    let release!: () => void
    const done = new Promise<void>((resolve) => (release = resolve))
    const tail = previous.then(() => done)
    this.tails.set(tenantId, tail)
    void tail.then(() => {
      if (this.tails.get(tenantId) === tail) this.tails.delete(tenantId)
    })

    let timer: NodeJS.Timeout | undefined
    const turn = await Promise.race([
      previous.then(() => true),
      new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), this.timeoutMs))),
    ])
    clearTimeout(timer)
    if (!turn) {
      // Gives its turn up when it comes, so the writes behind it keep their order.
      void previous.then(release)
      throw tenantBusy(tenantId)
    }
    const longest = setTimeout(release, this.maxTurnMs)
    try {
      return await write(release)
    } finally {
      clearTimeout(longest)
      release()
    }
  }
}
