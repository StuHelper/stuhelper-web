import type { Directive } from 'vue'

/**
 * Adds the class "in" the first time an element scrolls into view. The style
 * sheet decides what that looks like and turns it off for reduced motion.
 */
export const vReveal: Directive<HTMLElement> = {
  mounted(element) {
    if (typeof IntersectionObserver === 'undefined') {
      element.classList.add('in')
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      element.classList.add('in')
      observer.disconnect()
    }, { rootMargin: '0px 0px -8% 0px' })
    observer.observe(element)
    ;(element as HTMLElement & { revealObserver?: IntersectionObserver }).revealObserver = observer
  },
  unmounted(element) {
    (element as HTMLElement & { revealObserver?: IntersectionObserver }).revealObserver?.disconnect()
  },
}
