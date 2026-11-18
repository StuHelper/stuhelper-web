# StuHelper Web

StuHelper 的学生端 Web 应用，基于 Vue 3、TypeScript、Vite、Vue Router 和 Reka UI 构建。页面覆盖课程与教师查询、课程评价与导师评论、学习资料、校园认证、存储贡献和个人中心。所有资格、授权与选课事实均由服务端判定。

## 本地开发

需要 Node.js 24.22.1 和 pnpm 10.33.4。

```bash
make setup
make check
make dev
```

开发服务器默认监听 `127.0.0.1:5173`，并将 `/api` 代理到 `127.0.0.1:8080`（可通过 `STUHELPER_API_TARGET` 覆盖）。生产环境由同源反向代理托管静态资源并转发 `/api` 请求。

## 界面与交互

全局设计令牌位于 `src/styles`，门户与产品介绍样式位于 `src/styles/landing.css`。导航栏、底部标签栏、菜单、弹层与通知使用半透明液态玻璃令牌，正文卡片使用实色表面以确保对比度。

顶部主导航在校园、API 和 Store 之间切换，每个产品区域通过 `data-product` 切换强调色。进入校园区域后显示发现、课程、教师、学习资料与对比二级导航；手机端使用底部悬浮胶囊标签栏。

下拉框统一使用基于 Reka UI 封装的 `AppSelect.vue`，支持完整键盘操作；校园认证页下拉框关闭页面滚动锁定，保证开关前后布局零偏移。弹层与快速查看抽屉在手机端从底部滑出。

外观默认跟随系统，导航栏切换后将偏好保存在本机 `stuhelper.theme` 并写入根元素 `data-theme`。全站使用 CSS 逻辑属性适配阿拉伯语从右向左（RTL）布局，并响应系统减弱动态效果设置。

## 服务范围与内容准入

社区默认学校由会话接口 `session.content_school_id` 指定，不使用构建期学校常量。学生与教师认证支持按学校代码、五位代码、名称或登记别名查询学校。

路由通过 `meta.access: 'verified'` 标记校园内容页，通过 `meta.access: 'member'` 标记仅需登录的个人记录页。`src/features/account/access.ts` 将准入归纳为未登录、未认证、处理中、通过、失效与读取失败六种状态；未具备有效校园资格时内容页不挂载且不发业务请求，个人中心自有记录仍可访问。

## 页面与路由

| 路径 | 当前内容 |
| --- | --- |
| `/` | 品牌门户页，展示校园、API、Store 与开放平台（启用时）入口 |
| `/newapi`、`/store` | StuHelper API 与 StuHelper Store 宣传页，外链至独立业务站点 |
| `/campus` | 校园首页，含搜索、快捷入口、待办、热门课程、最新资料与最近浏览 |
| `/courses`、`/teachers` | 课程与教师目录，支持分面筛选、学院独立展开与快速查看抽屉；筛选条件仅保存在页面状态中 |
| `/courses/:id`、`/teachers/:id` | 课程或教师主页，展示五维等级、评价列表、关联任课教师或所授课程；不展示开课、教学班及上课时间地点 |
| `/offerings/:id`、`/classes/:id` | 已关闭，访问时重定向至 `/courses` |
| `/reviews/:id` | 单条评价完整讨论串与回复发布 |
| `/compare` | 最多五门课程或五位教师的同时间区间评分并排对比 |
| `/search`、`/popular` | 全站聚合搜索与热门排行（随搜索能力启用） |
| `/resources` | 资料浏览、目录导航、分类字段筛选与多选打包下载 |
| `/resources/items/:id` | 资料详情、下载与积分或 Ivory 访问权解锁 |
| `/resources/new`、`/resources/items/:id/edit` | 资料信息保存、文件上传与提交审核三步向导 |
| `/notifications` | 消息中心，支持分类筛选、会话已读与实时内容名称展示 |
| `/me` | 个人中心概览、认证标记、统计卡片、待办动态与设备管理 |
| `/me/reviews`、`/me/reviews/entries/:id` | 本人评价、撤回与普通草稿、处置申请与非公开评价详情 |
| `/me/votes`、`/me/favorites` | 本人评价投票记录、收藏夹管理与跨类型收藏列表 |
| `/me/resources`、`/me/requests` | 本人上传资料及下架、投诉、申诉回执 |
| `/me/wallet`、`/me/membership` | 积分与 Ivory 余额、充值兑换退款、会员覆盖范围与购买 |
| `/me/apps`、`/me/developer`、`/oauth/authorize` | 第三方应用授权管理、开发者应用与撤回通知回执、OAuth 授权确认 |
| `/me/groups`、`/me/qq/callback` | 校内 QQ 群申请状态与 QQ 账号绑定回调 |
| `/me/profile`、`/me/account` | 公开资料与群名片字段逐项许可、安全设置与关联方式 |
| `/me/verification`、`/me/account/identity`、`/me/verification/teacher`、`/verification/capture` | 学生认证、独立实名、教师认证及手机扫码拍照入口 |
| `/me/storage` | 存储透明度统计、本人存储贡献与北航网盘账号托管授权 |
| `/me/courses` | 正式构建中保持关闭并重定向至 `/me` |

“我的课程”功能开关位于 `src/app/features.ts`，正式构建恒为关闭，校园首页不读取选课记录。仅在同时设置 `VITE_DEMO=1` 与 `VITE_DEMO_MY_COURSES=1` 启动审阅原型时使用模拟数据展示周课表。

## 代码结构与传输层

```text
src/app/          路由、国际化、外壳布局与功能开关
src/shared/       同源传输、运行时契约校验、会话、幂等写入与通用组件
src/features/     按业务模块划分的页面、接口封装与单测
src/api/          提供方生成的 OpenAPI 类型与浏览器 SDK（禁止手改）
src/demo/         仅 VITE_DEMO=1 加载的审阅原型与模拟服务
src/locales/      八种语言界面词条
```

`src/shared/api/http.ts` 统一负责同源请求、CSRF 头注入、`redirect: 'error'`、超时取消、响应体积上限与错误码归一。所有业务 JSON 响应在进入业务层前均通过 `schemaOf` 对照提供方 OpenAPI 结构完成运行时校验。

写操作统一携带 `Idempotency-Key`。网络中断、超时或网关未知错误将 `useMutation` 置为 `uncertain`，锁定表单并仅允许使用冻结的原请求体和原幂等键重试。存储贡献与网盘托管复用提供方 SDK，托管提交后立即清空密码，恢复流程仅查询申请标识。

会话检查合并并发请求，遇到 `503`、网络故障或超时按 1 至 8 秒有界退避，保留已挂载页面的用户输入；收到明确 `401` 时立即清空登录态与私有数据。退出登录调用 `/api/v1/auth/logout` 或 `logout-all`，清空最近浏览记录并返回门户首页。

## 业务规则与状态说明

目录列表、分面计数与排序读取 `GET /api/v1/catalog/directory`，开课截止学期（默认 2023 秋）和可见性由服务端执行。推荐等级、五维分布与学期趋势读取 `GET /api/v1/reviews/summaries`，不展示精确数值均分。

评价列表携带 `include_reply_preview=true` 直接渲染回复数与前三条回复预览，旧服务端未返回预览时回退到进入视口后按需读取。通知列表携带 `include_content_names=true` 显示目标当前名称，内容删除或无权查看时显示不可用状态。

选课记录与学期趋势按 `term_order_key` 排序，保留服务端夏季学期顺序。评价编辑器校验必选条件，支持普通草稿跨端冲突比对与撤回后 24 小时限时重编；超过 5 分钟直接编辑窗口的修改和删除走审核申请。

校园认证表单在提交按钮旁通过 `aria-live` 播报具体方法错误并保留有效输入。学校资料卡仅按服务端投影展示学号、姓名与学院三项字段，标注已识别来源，认证时间严格绑定当前所选凭证的 `verified_at`。

## 部署模块能力

应用启动时读取 `/api/v1/system/capabilities` 控制可选模块入口显隐。能力尚未返回前不挂载受控业务页；模块关闭时直接访问对应路径展示 404 且不发业务请求；能力接口读取失败时保留入口并交由服务端逐次授权。

## 国际化

默认语言为简体中文，完整支持英文、法文、俄文、日文、韩文、西班牙文与阿拉伯文八种语言。数字、货币、字节、日期（默认时区 `Asia/Shanghai`）及带时钟偏差钳制的相对时间统一由 `src/shared/format.ts` 基于 `Intl` 格式化。

与英文拼写相同的非英语合法词条登记在 `locale-policy.yaml`，由 `pnpm run check:i18n` 自动核验键集合、占位符和复数规则。

## 契约与检查

`contracts/` 下的 OpenAPI 快照与 `src/api/*.gen.ts` 由提供方仓库生成并通过 `*.source.json` 记录版本、提交与 SHA-256 摘要，接口变更须先更新提供方契约再同步生成产物。

`make check` 依次执行存储与学术等全部契约一致性检查、仓库卫生检查、国际化检查、`vue-tsc` 类型检查、ESLint 零警告检查、Vitest 单测、Vite 生产构建和 GitHub Actions 工作流检查；文档规范与单段字数由 `pnpm run check:docs` 校验。

浏览器端到端测试（`pnpm run browser`）基于 Playwright 与 HTTP 契约夹具覆盖桌面与移动视口，关键客户端验收场景登记在 `module.json` 的 `scenario_tests` 中。原型课表与演示用例通过 `pnpm run browser:demo` 独立验证。
