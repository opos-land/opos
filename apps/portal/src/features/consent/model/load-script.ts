/**
 * Adds a script of another origin to the page: the one way a tracker's `load` starts it, and the
 * one module allowed to (src/app/third-party.test.ts).
 */
export function loadScript(src: string, attributes: Record<string, string> = {}) {
  const script = document.createElement('script')
  script.src = src
  script.async = true
  for (const [name, value] of Object.entries(attributes)) script.setAttribute(name, value)
  document.head.append(script)
}
