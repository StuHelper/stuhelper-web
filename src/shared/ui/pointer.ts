import type { Directive } from 'vue'

type Tracked = HTMLElement & { pointerCleanup?: () => void }

function track(element: Tracked, move: (x: number, y: number, box: DOMRect) => void, leave: () => void) {
  // Touch has no hover position, so only a mouse or pen drives these effects.
  const onMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    const box = element.getBoundingClientRect()
    move(event.clientX - box.left, event.clientY - box.top, box)
  }
  element.addEventListener('pointermove', onMove)
  element.addEventListener('pointerleave', leave)
  element.pointerCleanup = () => {
    element.removeEventListener('pointermove', onMove)
    element.removeEventListener('pointerleave', leave)
  }
}

/** Publishes the pointer position as --mx and --my, for a highlight that follows it. */
export const vSpotlight: Directive<Tracked> = {
  mounted(element) {
    track(element, (x, y) => {
      element.style.setProperty('--mx', `${x}px`)
      element.style.setProperty('--my', `${y}px`)
    }, () => undefined)
  },
  unmounted: (element) => element.pointerCleanup?.(),
}

/** Publishes a small tilt as --rx and --ry (degrees) that leans towards the pointer. */
export const vTilt: Directive<Tracked, number | undefined> = {
  mounted(element, binding) {
    const limit = binding.value ?? 5
    track(element, (x, y, box) => {
      element.style.setProperty('--ry', `${((x / box.width) - .5) * 2 * limit}deg`)
      element.style.setProperty('--rx', `${(.5 - (y / box.height)) * 2 * limit}deg`)
    }, () => {
      element.style.setProperty('--rx', '0deg')
      element.style.setProperty('--ry', '0deg')
    })
  },
  unmounted: (element) => element.pointerCleanup?.(),
}
