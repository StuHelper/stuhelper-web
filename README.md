# StuHelper Web

StuHelper Web 应用框架，使用 Vue 3、TypeScript、Vite 与 Vue Router。当前提供基础布局、真实平台接口状态、错误重试与未开放页面提示。业务功能尚未实现。

## 本地开发

需要 Node.js 24.22.1。

```bash
make setup
make check
make dev
```

默认监听 127.0.0.1:5173，开发 API 代理为 127.0.0.1:8080，可通过 STUHELPER_API_TARGET 修改。生产静态站点由同源反向代理转发 /api 请求。

## 结构

App 只组装布局和路由。usePlatform 负责请求生命周期、取消与重试；client.ts 校验接口版本并映射错误。页面仅显示后端真实返回的状态，不提供演示登录或虚构业务数据。

contracts/platform.openapi.yaml 是平台接口快照，src/api/platform.gen.ts 由 openapi-typescript 生成。接口更新先修改提供方，重新生成后同步快照，不能手改类型。生成工具单独固定兼容的 TypeScript 5.9.3。

纸飞机图标沿用项目负责人已确认的 StuHelper 品牌资产。业务规格和多仓库入口见 [StuHelper Next](https://github.com/StuHelper/stuhelper-next)。

## 工程配置来源

工程配置参考官方 create-vue 3.24.0 的 TypeScript、Router、Vitest 和 ESLint 模板。TypeScript 使用 `@vue/tsconfig` 与 `@tsconfig/node24`，ESLint 使用 `@vue/eslint-config-typescript`。应用、Node 工具与测试分别维护编译配置。

现有 Vue、Vite、Vue Router 与接口依赖继续使用已验证版本，页面和国际化逻辑由本仓库维护。跨仓浏览器联调放在架构仓库，项目的格式、语言和契约规则由共享工程工具与现成检查器执行。
