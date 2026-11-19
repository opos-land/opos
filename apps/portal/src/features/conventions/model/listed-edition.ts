/**
 * The convention's name to show beside an edition in the list of every convention's editions, or
 * null when the edition's own name already holds it: "Convention A 2027" says whose it is,
 * "Spring edition" does not.
 */
export function conventionBeside(editionName: string, conventionName: string): string | null {
  const convention = conventionName.trim()
  return editionName.toLocaleLowerCase().includes(convention.toLocaleLowerCase())
    ? null
    : convention
}
