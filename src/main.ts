import { createApplication } from './application'

// 审阅原型：只有 VITE_DEMO=1 时才加载模拟后端，正常构建不包含这部分代码。
if (import.meta.env.VITE_DEMO) {
  void import('./demo').then(({ installDemo }) => {
    installDemo()
    createApplication().mount('#app')
  })
} else {
  createApplication().mount('#app')
}
