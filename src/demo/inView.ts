import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

// 图表第一次进入视口时才播放入场动画。不支持 IntersectionObserver 时直接显示。
export function useInView(target: Ref<Element | undefined>) {
  const seen = ref(false)
  let observer: IntersectionObserver | undefined
  onMounted(() => {
    if (!target.value || !window.IntersectionObserver) { seen.value = true; return }
    observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { seen.value = true; observer?.disconnect() } }, { threshold: .2 })
    observer.observe(target.value)
  })
  onBeforeUnmount(() => observer?.disconnect())
  return seen
}
