# Jason's Study — 仓库说明

> 这个 README 给操作者看。访问者请直接看 [src/content/docs/index.md](src/content/docs/index.md) 或本地启 dev server。

## 这是什么

围绕"AI 时代产品工程师"成长路径，深度研究 GitHub 开源项目并写学习笔记的站点。
Astro + Starlight 构建，未来会发布到 GitHub Pages（条件成熟后）。

## 目录

```
src/content/docs/
├── index.md           ← 主页
├── career-plan.md     ← 培养路线
├── queue.md           ← 推荐队列
└── projects/          ← 单项目研究笔记
```

## 本地开发

```bash
npm install
npm run dev    # http://localhost:4321/study/
npm run build  # 输出到 dist/
```

## 自动化运维（cron 编队）

由 4 个 Claude Code cron job 维护内容更新：

| Job ID | 触发 | 职责 |
|--------|------|------|
| `302f8626` | 每小时 :13 | 取队列顶部 1 个项目研究 |
| `fb75dff9` | 每小时 :33 | 同上（错峰避 git 冲突） |
| `7a933b53` | 每小时 :53 | 同上 |
| `dee3c873` | 每 4 小时 :08 | 精炼班：交叉链接 / 概念抽取 / 质量审校 / 模式识别 / 一致性修复 |

每个 cron 自我延续，永不停。控制：

- 暂停全部：在 Claude Code 里说"删所有 study 的 cron"
- 暂停单个：跟 Claude 说要停哪个（如"停精炼班"删 `dee3c873`）
- 改频率：删了重建，cron 表达式自定
- 改方向：直接编辑 `src/content/docs/queue.md` 重排序，下次触发会读最新

## 发布到 GitHub Pages

条件成熟后，跟 Claude Code 说"现在推 study 到 GitHub"，会跑：

1. `gh repo create estelledc/study --public`
2. `git remote add origin` + `git push -u origin main`
3. `gh api` 启用 Pages（从 GitHub Actions 部署）
4. `.github/workflows/deploy.yml` 接管自动构建发布

URL：<https://estelledc.github.io/study/>
