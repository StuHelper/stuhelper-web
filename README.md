# StuHelper Web

StuHelper Web 应用框架，使用 Vue 3、TypeScript、Vite 与 Vue Router。当前提供社区首页、课程与教师主页、开课与教学班、课程评价、导师评论、讨论和个人内容。页面通过同源业务 API 读取数据，业务身份和可信选课事实由后端提供。

## 本地开发

需要 Node.js 24.22.1。

```bash
make setup
make check
make dev
```

默认监听 127.0.0.1:5173，开发 API 代理为 127.0.0.1:8080，可通过 STUHELPER_API_TARGET 修改。生产静态站点由同源反向代理转发 /api 请求。

## 结构

App 只组装布局和路由。usePlatform 负责请求生命周期、取消与重试；client.ts 校验接口版本并映射错误。页面仅显示后端真实返回的数据。课程列表按学院、类别和性质筛选，不展示学期。评课编辑器绑定学期，教师候选随本人该学期选课记录变化。

contracts/platform.openapi.yaml 是平台接口快照，src/api/platform.gen.ts 由 openapi-typescript 生成。接口更新先修改提供方，重新生成后同步快照，不能手改类型。生成工具单独固定兼容的 TypeScript 5.9.3。

纸飞机图标沿用项目负责人已确认的 StuHelper 品牌资产。业务规格和多仓库入口见 [StuHelper Next](https://github.com/StuHelper/stuhelper-next)。

社区入口为 `/community`。课程与教师主页提供基本信息、评分、评价筛选和历次开课，教学班保留本班教师及课表。个人内容入口为 `/community/me`，包括评价、草稿、收藏、投票和申请状态。

编辑器显示服务端当前资格和讨论身份。普通草稿发布后移出草稿箱；版本冲突由用户选择保留哪一版。撤回草稿保留原到期时间，保存失败与未知结果重试均保留输入。

编辑器逐项展示可公开的权威标签和实际值，未授权字段不出现。学生可以选择真实姓名；教师回复曾任教课程时，姓名和认证标识预先选中且不能取消。其他回复中的姓名与认证标识独立选择。个人内容页面提供处置复核入口。

## 工程配置来源

工程配置参考官方 create-vue 3.24.0 的 TypeScript、Router、Vitest 和 ESLint 模板。TypeScript 使用 `@vue/tsconfig` 与 `@tsconfig/node24`，ESLint 使用 `@vue/eslint-config-typescript`。应用、Node 工具与测试分别维护编译配置。

现有 Vue、Vite、Vue Router 与接口依赖继续使用已验证版本，页面和国际化逻辑由本仓库维护。课程与评价 OpenAPI 快照及生成类型位于 contracts 与 src/api。所有响应按随包 schema 校验，未知写入结果重试同一幂等键，失败保留输入。

跨仓浏览器联调放在架构仓库，项目的格式、语言和契约规则由共享工程工具与现成检查器执行。
