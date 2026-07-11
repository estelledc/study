---
title: Trilium — 树形层级笔记系统
来源: 'https://github.com/zadam/trilium'
日期: 2026-07-07
分类: editors
难度: 初级
---

## 是什么

Trilium 是一个开源的层级笔记系统：它把所有笔记放进一棵可以无限展开的树里，同时保留链接、关系图、脚本和自托管同步。

日常类比：它像一个很大的资料柜，每张纸都可以放在多个抽屉里，还能在纸上贴标签、画关系线、接一条自动化流水线。

最小使用例子不是代码，而是一棵笔记树：

```text
Root
├─ Work
│  └─ Internship
│     └─ Daily notes
└─ Tech
   └─ JavaScript
      └─ Trilium script snippets
```

和普通文件夹不同，Trilium 的同一条笔记可以被“克隆”到多个位置；你改其中一个位置，其他位置看到的是同一份内容。

它的定位不是纯 Markdown 编辑器，而是“个人知识库服务器 + 桌面客户端 + 可脚本化数据库”的组合。

## 为什么重要

不用 Trilium 这类系统，下面这些事会变得很难：

- 笔记树一大，单纯靠文件夹分类会卡住，因为一个主题常常同时属于多个父主题。
- 想在家里服务器、电脑浏览器、桌面端之间同步笔记，会被账号、云服务和数据格式绑住。
- 想给笔记加元数据、状态、关系、自动化按钮，普通 Markdown 文件很快不够用。
- 知识库超过几万条时，只靠“页面 + 搜索”不够，还需要局部聚焦、关系图和可维护的结构。

Trilium 的价值在于：它把“写笔记”升级成“维护一棵可查询、可自动化的个人知识树”。

## 核心要点

1. **树形结构是主干**。类比：先有图书馆书架，再有每本书里的书签。Trilium 默认用父子层级组织笔记，但支持任意深度和局部聚焦。

2. **属性和关系是索引**。类比：一份档案除了正文，还能贴“负责人”“状态”“依赖谁”的标签。`#label` 存元数据，`~relation` 连接另一条笔记，后面可以搜索、展示和脚本读取。

3. **脚本把笔记变成应用**。类比：资料柜旁边放了一台小机器，按按钮就能新建任务、拉取外部数据或开放一个接口。Trilium 同时有前端脚本、后端脚本和 ETAPI。

这三条合起来，就是“树负责秩序，关系负责连接，脚本负责动作”。

## 实践案例

### 案例 1：用 Docker 起一个自托管笔记服务器

官方文档推荐服务器部署优先考虑 Docker，数据目录要挂到宿主机：

```bash
docker pull triliumnext/trilium:v0.91.6
docker run -d \
  -p 127.0.0.1:8080:8080 \
  -v ~/trilium-data:/home/node/trilium-data \
  triliumnext/trilium:v0.91.6
```

逐部分解释：

- `docker pull`：先固定一个版本；官方文档提醒不要随便用 `latest`，因为自动升级可能影响同步。
- `-p 127.0.0.1:8080:8080`：只让本机访问，适合前面再接 Nginx 或本机测试。
- `-v ~/trilium-data:/home/node/trilium-data`：把真正的笔记数据库放在宿主机，容器删了数据还在。

这个案例说明 Trilium 的服务端思路：前端像网页应用，核心数据和同步能力放在你自己的服务器里。

### 案例 2：给任务系统加一个“新任务”按钮

官方脚本示例展示了一个前端启动脚本：启动后在工具栏加按钮，点击后让后端创建任务笔记。

```js
api.addButtonToToolbar({
  title: "New task",
  icon: "task",
  shortcut: "alt+n",
  action: async () => {
    const taskId = await api.runOnBackend(() => {
      const root = api.getNoteWithLabel("taskTodoRoot");
      return api.createTextNote(root.noteId, "New task", "").note.noteId;
    });
    await api.waitUntilSynced();
    await api.activateNewNote(taskId);
  }
});
```

逐部分解释：

- `addButtonToToolbar`：在界面上放一个按钮，不需要改 Trilium 源码。
- `runOnBackend`：创建笔记是服务端动作，所以前端把这一步交给后端执行。
- `getNoteWithLabel("taskTodoRoot")`：脚本不硬编码目录，而是用标签找到任务根节点。
- `waitUntilSynced` 和 `activateNewNote`：等客户端看到新笔记，再自动打开它。

这个案例体现了 Trilium 和普通笔记工具的差别：笔记库本身可以被脚本扩展成小应用。

### 案例 3：用 ETAPI 从外部脚本读取或导出笔记

官方 ETAPI 文档给了 Bash 交互方式：用 token 访问本地或远程 Trilium。

```bash
TOKEN="replace-with-etapi-token"
SERVER="http://localhost:8080"
NOTE_ID="i6ra4ZshJhgN"

curl "$SERVER/etapi/notes/$NOTE_ID/content" \
  -H "Authorization: $TOKEN"

curl "$SERVER/etapi/notes/$NOTE_ID/export" \
  -H "Authorization: $TOKEN" \
  --output "out/$NOTE_ID.zip"
```

逐部分解释：

- `TOKEN`：所有 ETAPI 操作都要认证；不要把真实 token 写进公开脚本。
- `/content`：拿到某条笔记的 HTML 内容，适合做备份、同步或二次处理。
- `/export`：把一条笔记连同子树导出成压缩包，适合定期留快照。

这个案例适合把 Trilium 接到外部工具里：比如定时导出、生成日报、或把其他系统的数据写回笔记树。

## 踩过的坑

1. **把克隆当复制**：克隆不是复制新正文，而是同一条笔记出现在多个父节点；改一处会影响所有位置。

2. **随手用 Docker `latest`**：服务端和客户端同步版本可能受升级影响；固定版本更稳。

3. **自定义接口忘记鉴权**：官方 custom request handler 默认要你自己处理认证；否则外部请求可能直接写入笔记。

4. **坏脚本卡住启动**：启动脚本或组件脚本出错时，可以用 `TRILIUM_SAFE_MODE=true ./trilium` 先进入安全模式再修。

## 适用 vs 不适用场景

**适用**：

- 想做长期个人知识库：学习笔记、项目资料、读书摘要、任务记录都放在一棵树里。
- 需要自托管同步：你愿意维护自己的服务器和备份，不想完全依赖 SaaS。
- 喜欢结构化笔记：标签、关系、属性、关系图对你很重要。
- 想用脚本自动化笔记：按钮、接口、导入导出、数据处理都能接进去。

**不适用**：

- 只想写纯文本长文：[[marktext]] 或普通 Markdown 编辑器更轻。
- 只想用手机快速捕获：Trilium 有移动网页和第三方客户端，但不是最省心路线。
- 团队协作需要权限、评论、多人实时编辑：Notion / Coda 这类产品更直接。
- 不愿意维护服务端：自托管带来数据所有权，也带来升级、备份和排障责任。

## 历史小故事（可跳过）

- 2017 年左右，zadam 开始实现 Trilium，目标是做一个能承载大型个人知识库的层级笔记应用。
- 早期项目围绕桌面端、Web 服务端、同步、富文本编辑器和脚本 API 慢慢扩展。
- 后来原作者把项目交给社区继续维护，TriliumNext 接过仓库和文档，继续推进新版本。
- README 说明，从 zadam/Trilium 迁到 TriliumNext 通常不需要特殊迁移；但较新版本的同步协议已经继续演进。
- 到 2026 年，GitHub 页面显示它是 3 万 star 以上的项目，生态里还有 Trilium Rocks 和 awesome-trilium 这类教程与扩展集合。

## 学到什么

- 树形笔记的重点不是“目录更深”，而是让每条笔记在知识库里有明确位置。
- 克隆和关系解决的是同一个现实问题：一个知识点常常属于多个上下文。
- 脚本能力让笔记系统从“记录工具”变成“个人工作台”，但也要求你认真处理权限和错误。
- 自托管不是免费午餐；它换来数据控制权，也把备份、版本和安全交回给使用者。

## 延伸阅读

- 官方仓库：[TriliumNext/Trilium](https://github.com/TriliumNext/Trilium)
- 官方文档：[docs.triliumnotes.org](https://docs.triliumnotes.org/)
- Docker 部署：[Using Docker](https://docs.triliumnotes.org/user-guide/setup/server/installation/docker)
- 脚本示例：[New Task launcher button](https://docs.triliumnotes.org/user-guide/scripts/frontend-basics/examples/new-task-button)
- API 文档：[ETAPI](https://docs.triliumnotes.org/user-guide/advanced-usage/etapi)
- 同类工具：[[logseq]]、[[foam]]、[[affine]]

## 关联

- [[logseq]] —— 同样关注个人知识库，但 Logseq 以 block 和双链为核心
- [[foam]] —— 纯 Markdown + VS Code 路线，适合和 Trilium 的数据库路线对照
- [[codemirror]] —— Trilium 的代码笔记需要浏览器代码编辑器这类底层能力
- [[prosemirror]] —— 富文本编辑器模型能帮助理解 Trilium 的正文编辑体验
- [[sqlite]] —— Trilium 的知识库最终需要可靠的本地数据库承载大量笔记
- [[docker]] —— 自托管部署最常见入口，用容器固定运行环境
- [[nginx]] —— 公开访问 Trilium 服务时常放在反向代理后面

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
