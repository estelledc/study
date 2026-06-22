# site-v1 — recursive dogfood

> 用 cookbook 自己造 cookbook 的展示站：每个开发决策只查 `v6/lens-*.md` + `v6/paradigm/`，不查外部 best practice。

## 跑

```bash
cd v6/site-v1
python3 build.py    # → 12 个 html + index.html (手写) + style.css
open index.html
```

## 这站怎么决策出来的（10 步 friction_log 摘要）

| 步 | 内容 | cookbook 节点 | 选择 | friction |
|---|---|---|---|---|
| 1 | 站点框架 | lens-devtool Q6 | 自建 SSG (python md) | cookbook_silent (mid) — 非 Vue/i18n/Rust 文档站没 fallback |
| 2 | 路由 | lens-frontend Q0 | file-based | cookbook_too_abstract (low) |
| 3 | 内容存储 | Q0 蕴含 | md 直读 | no_friction |
| 4 | 样式 | lens-frontend 候选表 | 手写 CSS | cookbook_too_specific (high) — Tailwind trigger 把展示型小站挤出 |
| 5 | 决策表渲染 | — | HTML table + ring 配色 | cookbook_silent (low) — schema 不管 UI |
| 6 | 站内搜索 | lens-data Q5 / lens-frontend | placeholder 输入框 | cookbook_silent (high) — 阻塞，前端静态搜索零覆盖 |
| 7 | 部署 | lens-devops Q0 | GH Pages | cookbook_too_specific (mid) — Pages 不在 Vercel/Fly/Workers 候选里 |
| 8 | 部署 cost gate | lens-devops Q0 | 跳 K8s | no_friction（验证 F9 价值） |
| 9 | CI | lens-devops 候选表 | GH Actions | no_friction |
| 10 | Release | lens-devtool Q5 | 跳过（静态站不 release） | cookbook_too_specific (low) — Q1 产物分支漏静态站 |

完整开发日志：[../tools/real-use-recursive-dogfood-2026-05-31.md](../../tools/real-use-recursive-dogfood-2026-05-31.md)

## "write vs use" gap 三条核心发现

1. **候选表 trigger 默认"做应用"**：把展示型小站挤出候选集；新人会被 Tailwind trigger 误导。
2. **元任务暴露盲区**：决策表渲染 / 站内搜索 / 静态站发布——文档站类高频需求 0 覆盖。
3. **Q0 cost-gate 验证有效；但 Q1 出口不全**：F9 fix 真有用；lens-devtool Q1 "产物？"漏静态站出口。

## 与 site-v0 的区别

- index.html：从"链接列表"升级成"hero + 8 个 lens-card 卡片网格 + 决策导览"
- 左侧 nav：加搜索框（v1 仅 placeholder，v1.1 启用）
- 决策表：ring 列（adopt/trial/assess/hold）上色（绿/橙/紫/红）
- nav 加 lens-devtool（v0 漏了）
- CSS：引入变量；hero / lens-grid / 卡片悬浮微动；mobile breakpoint 880px

## 不做（本轮显式决策）

- pagefind 静态索引：留 v1.1，因为 lens 没说怎么选 → 写 friction 而不是直接拍
- dark mode：CSS 变量已就绪，但题目要求"基于 cookbook 决策"，cookbook 没说所以不主动加
- changesets/np release：本站不是发布物，跳过（Step 10 friction）
- 自动部署到 GH Pages：CI 配置文件留 v1.1（lens-devops 决策清晰，但题目要求 site，不要求 ops 配置）
