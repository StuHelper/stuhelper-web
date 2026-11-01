import { i18n } from '../app/i18n'

/** 模块级文案要在渲染时读取，这样切换语言后能立即更新。 */
export const tr = (key: string, params: Record<string, unknown> = {}) => (i18n.global.t as (key: string, params: Record<string, unknown>) => string)(key, params)
