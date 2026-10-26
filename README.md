# StuHelper Web

StuHelper Web 应用框架，使用 Vue 3、TypeScript、Vite 与 Vue Router。当前提供基础布局、真实平台接口状态、错误重试与未开放页面提示。已提供用户存储贡献面板，真实应用登录与供应商授权入口尚未接入。

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

现有 Vue、Vite、Vue Router 与接口依赖继续使用已验证版本，页面和国际化逻辑由本仓库维护。跨仓框架联调放在架构仓库，项目的格式、语言和契约规则由共享工程工具与现成检查器执行。

## 存储贡献

/contributions 展示公开容量汇总和本人贡献。选择已授权存储后，明确同意当前条款并设置额度、保留空间及期限。支持条件调整、续期、暂停、恢复、退出、撤权和原请求重试。后台确认前显示等待处理，退出未清理完副本时不显示完成。

服务端验证身份、归属和当前权限。贡献页面复用同源传输，不接受手工令牌或虚构角色。供应商密码只在独立托管页面提交。当前 backend 要求 Bearer 访问令牌，应用登录与认证传输尚未装配，默认显示未登录或不可用。Next SSO 和生产配置保持不动。

贡献 OpenAPI、生成类型及浏览器 SDK 来自 storage-contribution 的固定提交。make check 检查生成结果、摘要、类型、八语言和单元测试。SDK 的格式由提供方维护，客户端不重新格式化该快照。

运行 make build 后执行 pnpm browser。Playwright 1.64.1 使用明确 HTTP 夹具，覆盖八语言、桌面/移动、键盘确认、同意、条件调整、续期、未知结果重试、退出进度及撤权清空。首次执行需 pnpm exec playwright install --with-deps chromium。

测试截图按需存放在 CONTRIBUTION_SCREENSHOTS 指定的任务目录，默认关闭；每轮最多 16 张、总计不超过 20 MiB，人工检查后删除。测试报告只保留在本机 test-results，下一轮覆盖，任务结束清理；CI 不上传制品或配置共享缓存。

## 存储账号接入

/storage-accounts 提供 BHpan 首次接入、明确托管同意、截止时间、凭据更新和原申请恢复。接入完成后实例保持暂停，用户另行设置贡献条件。更新凭据保留原专用根、文件副本、额度和管理员准入。

提交后清空账号密码，未知结果只保存申请标识并通过服务端查询，浏览器不缓存密码或自动重发登录。列表与表单处理加载、空数据、拒绝、失败和重试；权限撤销后清空私有内容。

storage 提供 OpenAPI、生成类型和校验响应的浏览器 SDK，快照记录精确提交与摘要。当前页面使用现有认证传输，实际应用登录与真实账号验收待后续完成。八语言浏览器测试使用明确夹具，覆盖托管同意、更新、结果不明与原申请恢复。

托管页面截图使用 CUSTODY_SCREENSHOTS 指定的任务目录，默认关闭。人工检查只选中文桌面和阿拉伯语移动视口，两端总计最多四张、8 MiB，检查后删除。
