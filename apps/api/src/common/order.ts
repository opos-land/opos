/**
 * Where `id` lands when it moves to `place`, counted from 1, among the rows of a list in their order:
 * the others keep their order and make room, and a place past the end is the last one.
 */
export function moved(order: readonly string[], id: string, place: number): string[] {
  const rest = order.filter((other) => other !== id)
  const index = Math.min(Math.max(place, 1), rest.length + 1) - 1
  return [...rest.slice(0, index), id, ...rest.slice(index)]
}
