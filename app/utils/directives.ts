function processLinks(el: HTMLElement) {
  el.querySelectorAll('a').forEach((a) => {
    if (!a.getAttribute('target')) {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

export const vExternalLinks = {
  mounted(el: HTMLElement) {
    processLinks(el)
  },
  updated(el: HTMLElement) {
    processLinks(el)
  },
}
