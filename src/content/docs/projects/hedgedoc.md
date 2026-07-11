---
title: HedgeDoc — 协作 Markdown 编辑
来源: 'https://github.com/hedgedoc/hedgedoc'
日期: 2026-05-29
分类: editors
难度: 初级
---

## 是什么

HedgeDoc 是一个开源的实时协作 Markdown 笔记工具：几个人打开同一个链接，就能一边写纯文本，一边看到排版后的文档。

日常类比：它像一个共享白板，但白板上写的不是随手画的字，而是能保存成网页、会议纪要、技术文档和演示稿的 Markdown。

最小例子不是先写代码，而是先跑一个服务：

```bash
docker compose up -d
open http://localhost:3000
```

打开页面后，新建一篇 note，把链接发给同伴；左边写 `# 标题`、`- 待办`，右边立刻看到渲染结果。

它的重点不是“把 Markdown 变漂亮”，而是把“多人同时写同一份 Markdown”这件事变得可用。

## 为什么重要

不理解 HedgeDoc，下面这些事会很难解释：

- 为什么很多团队不愿意把会议纪要放在聊天软件里：消息流会冲走上下文，文档链接才适合长期引用。
- 为什么普通 Markdown 编辑器不够用：本地文件适合一个人写，不适合多人同时补充议程、结论和行动项。
- 为什么自托管很重要：有些团队想控制账号、附件、数据库和备份，不想把所有笔记交给外部平台。
- 为什么“实时协作”不只是自动保存：多人同时改同一段文字时，需要合并操作、权限和冲突处理。

## 核心要点

1. **实时协作：像多人一起改同一张菜单**。HedgeDoc 用协作编辑机制让不同浏览器的输入能合到同一份 note 里。你看到别人的光标和改动，说明服务器不只是存文件，还在协调操作顺序。

2. **Markdown 优先：像用统一暗号写排版**。使用者写的是普通 Markdown，再加上 HedgeDoc 支持的扩展能力，例如表格、图表、任务列表和 slide metadata。这样文档既能快速写，也能被导出、复制、版本化。

3. **部署可控：像把共享文档服务器放进自己机房**。官方文档提供 Docker、反向代理、认证和存储配置。数据库、上传目录、OAuth、LDAP、SAML 这些选项让它更像团队基础设施，而不是单机小工具。

## 实践案例

### 案例 1：给小团队开一个内部笔记板

官方 Docker 文档给的最小方向是：一个 PostgreSQL 数据库，加一个 HedgeDoc 应用容器。

```yaml
services:
  database:
    image: postgres:17.7-alpine
    environment:
      - POSTGRES_USER=hedgedoc
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=hedgedoc
  app:
    image: quay.io/hedgedoc/hedgedoc:1.11.0
    environment:
      - CMD_DB_URL=postgres://hedgedoc:password@database:5432/hedgedoc
      - CMD_DOMAIN=localhost
      - CMD_URL_ADDPORT=true
    ports:
      - "3000:3000"
```

逐部分解释：

- `database` 是真正保存 note、用户和历史的地方；不要把它当成临时缓存。
- `CMD_DB_URL` 告诉应用去哪里连数据库；这个值错了，页面可能能打开，但创建 note 会失败。
- `CMD_DOMAIN` 和 `CMD_URL_ADDPORT` 会影响 HedgeDoc 生成链接；反向代理场景里这两个配置尤其容易出错。

### 案例 2：把同一篇 Markdown 变成演示稿

HedgeDoc 支持用 YAML metadata 和分隔线把 note 当成 reveal.js slide 来看。

```markdown
---
title: 周会同步
tags: presentation
slideOptions:
  theme: solarized
  transition: 'fade'
---

# 本周目标

---

# 风险

----

## 风险的细节页
```

逐部分解释：

- 顶部 `slideOptions` 控制主题、切换动画等展示参数；缩进要保持两个空格。
- `---` 把内容切成横向下一页；`----` 切成纵向子页，适合“主结论 + 细节补充”。
- 同一份 Markdown 可以继续被协作编辑，演示模式只是另一种查看入口。

### 案例 3：用 HTTP API 预创建会议纪要

官方 API 文档说明，`POST /new` 可以把请求体里的 Markdown 导入成一篇新 note。

```bash
cat meeting.md | curl -X POST http://localhost:3000/new \
  -H 'Content-Type: text/markdown' \
  --data-binary @-
```

如果实例开启了 FreeURL 模式，还可以把别名放进 URL：

```bash
curl -X POST http://localhost:3000/new/weekly-sync \
  -H 'Content-Type: text/markdown' \
  --data-binary '# Weekly Sync'
```

逐部分解释：

- `Content-Type: text/markdown` 告诉服务端：这不是表单，而是一整篇 Markdown。
- `/new` 会生成随机 note id；`/new/weekly-sync` 会尝试使用可读别名。
- 这适合脚本提前生成每周会议模板，再把链接发到群里收集议题。

## 踩过的坑

1. **把 Docker 示例直接当生产配置**：官方明确说最小 compose 只适合快速开始，生产环境还要考虑 HTTPS、登录、备份和上传存储。

2. **反向代理没放行 WebSocket**：实时编辑走 `/socket.io/` 的升级连接，Nginx 或 Apache 配错会让编辑页一直加载。

3. **域名和 HTTPS 配置不一致**：`CMD_DOMAIN`、`CMD_PROTOCOL_USESSL`、`CMD_URL_ADDPORT` 不匹配时，图片、样式或生成链接会变坏。

4. **把一个数据库挂多个实例**：FAQ 说明 HedgeDoc 1.x 服务端不是完全无状态，多实例共用同一数据库会导致内容异常。

## 适用 vs 不适用场景

**适用**：

- 团队会议纪要、值班记录、项目 RFC，需要多人同时补充和长期保存。
- 教学或 workshop，需要学员在浏览器里练 Markdown，不想先安装本地编辑器。
- 内部知识库的草稿阶段，先协作写清楚，再沉淀到正式文档站。
- 想自托管，并且能维护数据库、反向代理、备份和登录系统。

**不适用**：

- 需要完整权限工作流、审批流和复杂文档生命周期的企业知识库。
- 只想写本地个人笔记，不需要协作、不需要浏览器访问。
- 需要离线优先、移动端原生体验或大量附件管理的场景。
- 不能接受自己运维服务、数据库和安全更新的团队。

## 历史小故事（可跳过）

- HedgeDoc 的前身来自 HackMD / CodiMD 这一支协作 Markdown 编辑器传统，目标一直是“多人一起写 note”。
- 后来社区驱动的分叉和原始项目之间出现命名冲突，于是社区版本改名为 HedgeDoc。
- 1.x 版本已经被很多团队长期使用，官方现在把它定位为稳定维护线。
- 主仓库的默认分支正在推进 HedgeDoc 2：一次更彻底的重写，把 backend 和 frontend 拆得更清楚。
- 这类项目的演进很典型：先解决“能一起写”，再补部署、认证、权限、迁移和安全这些长期运维问题。

## 学到什么

- 协作编辑器的价值不在“编辑器本身”，而在链接、权限、保存、导出和多人冲突处理这一整套闭环。
- Markdown 是一个低门槛接口：新人会打字就能写，工程师又能把它接进脚本和版本管理。
- 自托管工具要同时看产品功能和运维成本；Docker 一行跑起不等于生产可用。
- HedgeDoc 适合“草稿到共享知识”的中间层，不一定要替代正式文档站或项目管理系统。

## 延伸阅读

- 官方仓库：[hedgedoc/hedgedoc](https://github.com/hedgedoc/hedgedoc)
- 官方文档：[HedgeDoc Documentation](https://docs.hedgedoc.org/)
- 部署参考：[Docker Image](https://docs.hedgedoc.org/setup/docker/)
- 机制参考：[Operational Transformation](https://docs.hedgedoc.org/dev/ot/)
- [[markdown-it]] —— Markdown 渲染生态里常见的解析器项目。
- [[overleaf]] —— 同样强调浏览器里的多人协作，但面向 LaTeX 文档。

## 关联

- [[markdown-it]] —— HedgeDoc 的使用入口是 Markdown，理解解析器能看懂“语法到 HTML”的路径。
- [[codemirror]] —— 浏览器编辑器常要解决光标、选区和文本输入体验。
- [[yjs]] —— 另一类现代协作同步思路，可和 HedgeDoc 的 OT 历史对照。
- [[prosemirror]] —— 富文本编辑器框架，适合比较 Markdown 编辑和结构化编辑。
- [[marktext]] —— 偏个人桌面 Markdown 写作，和 HedgeDoc 的多人在线方向相反。
- [[mattermost]] —— 团队沟通工具，常和会议纪要、值班文档这类协作笔记互补。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bookstack]] —— BookStack — 文档型 Wiki
- [[etherpad-lite]] —— Etherpad — 经典协作文本编辑器
- [[outline]] —— Outline — 团队 Wiki 协作平台
