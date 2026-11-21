# 工程约定

<!-- updated: 2026-11-21 -->

- 本仓库是 StuHelper 按业务模块拆分的一部分。架构与业务边界以 [StuHelper](https://github.com/StuHelper/stuhelper) 为准。
- 普通变更从最新 `origin/develop` 创建专用短期分支和独立工作树，通过 PR squash 到 develop。发布由 develop 到 main 执行 merge commit。tag、镜像发行与生产晋级需要负责人明确授权。
- Web 常规检查和公开 GHCR 镜像工作流使用 GitHub 托管的 `ubuntu-26.04`。BJ1 Registry 的发行任务使用自建 runner。GitHub Actions 与部署镜像使用明确的版本 tag，以源码提交和摘要核验产物。
- 共享前端检查可恢复 GitHub 托管 Linux 的 Vite 与增量 TypeScript 缓存。PR 只读恢复，写入限 `develop` 或 `main` 的分支 push 或手动运行。缓存路径和键由固定版本的工程工具维护。
- 接口先定义 OpenAPI，再同步生成文件。客户端以服务端返回的事实和授权为准，通过公开接口协作。私有实现、凭据与原始身份数据留在获准的私有环境。
- Docker 测试使用任务专属资源，完成或失败后清理本任务创建的容器、无用镜像与缓存。保留其他任务的资源与未提交改动。

任务工作树统一放在 `workspace/worktrees/<任务>/<仓库名>`。公共测试、工具链升级、文档编号、许可证和 PR 约定遵循根仓规则。见[工程约定](https://github.com/StuHelper/stuhelper/blob/develop/AGENTS.md)。

## 界面与验证

- 界面文案和可访问名称使用翻译键，补齐八种语言。复数、日期、数字、金额和容量使用共享格式化接口。改动布局时核对移动视口、键盘操作和阿拉伯语 RTL。
- 使用 `make check` 运行仓库检查，使用 `pnpm run check:docs` 校验文档。正式构建的浏览器用例使用 `pnpm run browser`，审阅原型使用 `pnpm run browser:demo`。完整前提见 [README](README.md#契约与检查)。
- 关键场景在 `module.json` 的 `scenario_tests` 中登记已有规格编号、测试文件和用例标题。修复前复现缺陷，修复后重跑原检查及受影响的阶段。真实账号验收、发行和部署分别记录。

## 沟通与回复

- 代码或规则变化时同步更新现有文档，替换过时内容和重复说明。分别记录当前规则、实施状态和验证结果。尚待确认的产品选择保留 InReview。
- 使用自然、具体的现代汉语，写明对象、动作和结果。每段围绕一个主题，最多 200 个可见字符。长期文档使用相关写作技能。
- 回复先给结果，再给必要证据和剩余事项。已明确的授权直接沿用。Goal Mode 下减少进度沟通。
