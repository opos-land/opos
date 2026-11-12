/** A started tracker cannot be stopped in place: the page loads again without it. */
export function reloadPage() {
  window.location.reload()
}
