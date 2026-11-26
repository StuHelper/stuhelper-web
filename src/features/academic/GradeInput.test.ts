// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import { i18n } from '../../app/i18n'
import type { Grade } from './api'
import GradeInput from './GradeInput.vue'

let app: App | undefined
afterEach(() => app?.unmount())

function mountGrade(initial: Grade | undefined) {
  const grade = ref<Grade | undefined>(initial)
  const incomplete = ref(false)
  const Host = defineComponent(() => () => h(GradeInput, {
    modelValue: grade.value,
    'onUpdate:modelValue': (value: Grade | undefined) => { grade.value = value },
    incomplete: incomplete.value,
    'onUpdate:incomplete': (value: boolean) => { incomplete.value = value },
  }))
  const root = document.createElement('div')
  app = createApp(Host).use(i18n)
  app.mount(root)
  return { root, grade, incomplete }
}

const choose = (root: HTMLElement, text: string) => [...root.querySelectorAll<HTMLLabelElement>('label.choice')].find((label) => label.textContent?.trim() === text)!.querySelector('input')!.dispatchEvent(new Event('change'))

it('keeps the level of a restored draft on another scale', async () => {
  const { grade, incomplete } = mountGrade({ scale: 'percent', value: 92 })
  await nextTick()
  // "Use the saved version" replaces the whole value, scale and level together.
  grade.value = { scale: 'five_level', value: 'good' }
  await nextTick()
  await nextTick()
  expect(grade.value).toEqual({ scale: 'five_level', value: 'good' })
  expect(incomplete.value).toBe(false)
})

it('clears the level when the author switches the scale and asks for a new one', async () => {
  const { root, grade, incomplete } = mountGrade({ scale: 'five_level', value: 'good' })
  await nextTick()
  choose(root, i18n.global.t('academic.grade.scales.two_level'))
  await nextTick()
  await nextTick()
  expect(grade.value).toBeUndefined()
  expect(incomplete.value).toBe(true)
  choose(root, i18n.global.t('academic.grade.two.pass'))
  await nextTick()
  await nextTick()
  expect(grade.value).toEqual({ scale: 'two_level', value: 'pass' })
  expect(incomplete.value).toBe(false)
  choose(root, i18n.global.t('academic.grade.scales.withdrawn'))
  await nextTick()
  await nextTick()
  expect(grade.value).toEqual({ scale: 'withdrawn' })
})
