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
