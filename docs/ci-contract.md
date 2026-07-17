# CI 与 Pages 发布合同

关联任务：STUDY-T007、STUDY-T008、STUDY-T009，以及其后的内容、发现与规模门禁。

## 一条共用门禁

`npm run verify:ci` 是 PR 与 Pages build 共用的、无本机状态依赖的发布合同。任何子步骤失败都会立即停止。`npm run verify:pipeline` 保留给具备本地 worktree 与 ignored runtime 的桌面环境，不能放进无状态 GitHub runner。

PR workflow 只读取仓库；Pages 写权限和 OIDC 权限只授予 deploy job。依赖安装固定使用 `npm ci`，不允许在 lockfile 不一致时回退到 `npm install`。

PR 和 main push 都会完整 fetch Git 历史，并把可信事件 SHA 作为 `STUDY_CHANGED_FROM`。内容合同与质量门只对新增或实质修改的笔记施加强约束；纯链接修复和带 marker 的生成反向链接不冒充正文重写。workflow 还显式记录 UTC 审计日，用于 freshness 报告；Research 结构、10 个便携 lab 模块、961 项项目标准快照、模板相似度、Atlas、Pagefind、资产、无障碍、Pages artifact 和规模预算均为同一 fail-closed 链的一部分。依赖固定 LangGraph 源码的第 11 个模块由 `npm run test:research-labs:full` 在恢复外部工作树后验收，不伪装成无状态 CI 已覆盖。

## 供应链固定

外部 Actions 必须固定完整 40 位 commit SHA，并在同行保留已核验版本注释。`npm run audit:action-pins` 会阻断移动 tag、分支、短 SHA 或缺少版本注释的引用。Dependabot 后续更新应同时更新 SHA 与版本注释。

当前固定版本于 2026-07-10 从对应官方仓库核验：checkout v4.3.1、setup-node v4.4.0、upload-artifact v4.6.2、upload-pages-artifact v4.0.0、deploy-pages v4.0.5。

核验入口：[`actions/checkout` releases](https://github.com/actions/checkout/releases)、[`actions/setup-node` releases](https://github.com/actions/setup-node/releases)、[`actions/upload-artifact` releases](https://github.com/actions/upload-artifact/releases)、[`actions/upload-pages-artifact` releases](https://github.com/actions/upload-pages-artifact/releases)、[`actions/deploy-pages` releases](https://github.com/actions/deploy-pages/releases)。固定完整 SHA 的依据见 [GitHub 官方 secure use 指南](https://docs.github.com/en/actions/reference/security/secure-use)。

## 诊断与发布边界

原 `dist/build-info.txt` 会随 Pages 永久公开，因此已移除。workflow 只生成包含计数、字节数、警告/错误行数和 Node 版本的脱敏 JSON，作为保留 7 天的 Actions artifact；不复制原始日志、路径清单、环境变量或命中值。

`npm run audit:pages-artifact` 在上传 Pages 前拒绝 `build-info.txt`、日志、诊断文件和软链接。诊断 artifact 也必须保持脱敏；它不是保存秘密的保险箱。

## 外部验收

将 `verify:ci` 配置为 main 的 required check 属于 GitHub 仓库设置，不由源码 PR 自动完成。在获得仓库管理权限并实际确认前，该验收保持 `UNVERIFIED`。
