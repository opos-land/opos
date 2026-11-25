/**
 * What a row of the ticket holder list takes from the rows read beside its order
 * (docs/specs/0010-sales-reports.md, E2): its add-ons, which are its order's and those of every
 * paid order on its QR code, as a "Buy more" order holds no ticket of its own, and its answers to
 * the custom fields.
 */
export function ticketHolderDetails<Status>({
  fields,
  addOns,
  answers,
  carried,
  isPaid,
}: {
  /** The custom fields, in the order of their columns. */
  fields: readonly { id: string }[]
  /** The add-on lines of every order, in the catalog's order. */
  addOns: readonly { orderId: string; name: string }[]
  answers: readonly { orderId: string; fieldId: string; answer: string }[]
  /** The QR code each order carries, with the order's status. */
  carried: readonly { orderId: string; qrCodeId: string; status: Status }[]
  isPaid: (status: Status) => boolean
}) {
  // Every row is read once into what a ticket's row looks up by its order: a search of the rows
  // for each order would grow with their square, on the one thread every request waits for.
  const codeOf = new Map<string, string>()
  const paidOn = new Map<string, string[]>()
  for (const row of carried) {
    codeOf.set(row.orderId, row.qrCodeId)
    if (!isPaid(row.status)) continue
    const paid = paidOn.get(row.qrCodeId)
    if (paid) paid.push(row.orderId)
    else paidOn.set(row.qrCodeId, [row.orderId])
  }
  /** The add-on lines of each order, each with its place in the catalog's order. */
  const linesOf = new Map<string, { place: number; name: string }[]>()
  addOns.forEach((line, place) => {
    const lines = linesOf.get(line.orderId)
    if (lines) lines.push({ place, name: line.name })
    else linesOf.set(line.orderId, [{ place, name: line.name }])
  })
  const answersOf = new Map<string, Map<string, string>>()
  for (const row of answers) {
    const given = answersOf.get(row.orderId)
    if (given) given.set(row.fieldId, row.answer)
    else answersOf.set(row.orderId, new Map([[row.fieldId, row.answer]]))
  }
  return {
    /** The names of the add-ons a ticket's row lists, in the catalog's order. */
    addOns(orderId: string): string[] {
      const code = codeOf.get(orderId)
      /** The orders whose add-ons the row lists: its own, and the paid ones on its code. */
      const listed = new Set([orderId, ...((code && paidOn.get(code)) || [])])
      return [...listed]
        .flatMap((id) => linesOf.get(id) ?? [])
        .sort((a, b) => a.place - b.place)
        .map((line) => line.name)
    },
    /** The order's answer to each field, in the fields' order: empty where it gave none. */
    answers(orderId: string): string[] {
      const given = answersOf.get(orderId)
      return fields.map((field) => given?.get(field.id) ?? '')
    },
  }
}
