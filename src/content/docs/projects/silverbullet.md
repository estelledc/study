---
title: SilverBullet — 可编程的自托管 Markdown 知识库
来源: https://github.com/silverbulletmd/silverbullet
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：自家书房的「活字典 + 小脚本工作台」

想象你在家里有一间书房：所有笔记都是 **普通 Markdown 文件**，放在你控制的硬盘里（不是某家云服务的黑盒）。你打开浏览器就能写、能搜、能链到另一页——像 [[Foam]] 或 Roam 那样，页面之间 **双向链接**，侧边栏告诉你「谁引用了这个概念」。

SilverBullet 比这多走了一步：这间书房里还藏着一位 **会 Lua 的小管家（Space Lua）**。你在某页写 `${query[[ ... ]]}`，它就能按条件列出未完成任务；写一段 `space-lua` 代码块，全库都能调用；甚至给 `/meet` 绑一个 **Slash 模板**，一键插入会议记录骨架。官方把产品定位成 **Programmable, Private, Browser-based, Open Source, Self Hosted** 的个人知识管理平台——不是「又一个 Markdown 编辑器」，而是 **笔记 + 维基 + 轻量数据库 + 脚本** 的组合体。

仓库 [silverbulletmd/silverbullet](https://github.com/silverbulletmd/silverbullet) 约 4900+ star（2026 年初），MIT 开源；官网 [silverbullet.md](https://silverbullet.md) 与 v2 文档 [v2.silverbullet.md](https://v2.silverbullet.md/) 持续更新。前端 TypeScript + CodeMirror 6 + Preact，后端 Go，笔记以 **Space（空间）** 为根目录存成 `.md` 文件。

零基础路径：**Docker 或二进制起一个 Space → 浏览器登录 → 写第一篇带链接的笔记 → 试 SLIQ 查询 → 按需写 Space Lua / 模板**。

---

## 这个项目解决什么问题

### 痛点 1：SaaS 笔记的数据不在自己手里

Notion、部分 Roam 托管方案把内容锁在 vendor 格式或云端。SilverBullet **自托管**：Space 就是文件夹里的 Markdown，备份 = `rsync` / Git / 快照，符合 **数据主权（Data Sovereignty）**。

### 痛点 2：纯 Markdown 工具缺少「库级」能力

普通编辑器能写 `# 标题`，但难做：**全库任务视图**、**按 tag 聚合**、**动态首页**。SilverBullet 用 **Object Index** 索引页面、任务、标签、链接等，并通过 **SLIQ（Space Lua Integrated Query）** 像写 SQL 一样查笔记元数据。

### 痛点 3：扩展要么装插件市场，要么 fork 项目

SilverBullet 把扩展写进笔记本身：`space-lua` 代码块、`#meta/template/page` 页面模板、Plugs（Lua 插件包）。改行为 often **改 Markdown/Lua 文本**，可版本管理，适合「会一点脚本的知识工作者」。

### 痛点 4：要在手机、平板、桌面都能用，又不想 Electron 巨包

客户端是 **PWA（Progressive Web App）**：内容同步到浏览器本地存储，可离线读写的 entire Space；Chrome 系可「安装到桌面」，Safari/Android 可加主屏幕。不是 Electron 壳，而是 **打开 URL 就像 App**。

---

## 核心概念拆解

### 1. Space（空间）

**Space** 是 SilverBullet 管理的 **根目录**：里面全是 Markdown **Page（页面）**。一页一个文件，路径即页面名（可含文件夹，如 `Projects/Weekly.md`）。服务器进程 `./silverbullet /path/to/space` 或 Docker 把 host 目录挂到 `/space`，所有读写都落盘到这个目录。

### 2. Page、Link 与双向链接

页面之间用 **Wiki 式链接**（具体语法见官方 Link 文档，与 Roam/Obsidian 的 `[[page]]` 同类）。SilverBullet 维护 **Linked Mention**：不只「我从 A 链到 B」，还能在 B 上看到 **哪些页链回了 B**。写综述、发现意外关联时，这比全文搜索更贴近「关系图」。

### 3. Live Preview 与 Outliner / Task

- **Writer 向**：CodeMirror 6 上的 **Live Preview** Markdown 编辑。
- **Outliner 向**：大纲工具折叠、重组层级。
- **GTD 向**：Task 语法与索引；可配合 SLIQ 做「全库未完成待办」视图。

### 4. Objects 与 Object Index

笔记里的结构（页面、任务、标签、`space-lua` 定义等）被解析为 **Object**，进入索引。查询时通过 `index.pages()`、`index.tag "task"` 等 API 访问——这是 SLIQ 的数据源，也是「笔记即数据库 schema」的基础。

### 5. Space Lua

**Space Lua** 是嵌入 SilverBullet 的 Lua 方言（自研运行时，非标准 LuaJIT/WASM 套壳），两类用法：

| 机制 | 作用 |
|------|------|
| ` ```space-lua ` 代码块 | **Definitions**：全 Space 生效的函数、命令、模板注册 |
| `${expression}` | **Expressions**：行内求值并 Live Preview 渲染结果 |

加载顺序可用 `-- priority: N` 注释控制（数字越大越先加载）；改脚本后 **System: Reload**（Ctrl+Alt+R）可热重载。

### 6. SLIQ（Integrated Query）

SLIQ 用 `query[[ ... ]]` 语法，SQL 风格：`from` / `where` / `order by` / `limit` / `select`。在 Markdown 里写作 `${query[[ from p = index.pages() ... ]]}`，结果 **内联渲染** 成列表或表格。可与 `templates.pageItem`、`templates.taskItem` 等组合成富 UI。

### 7. Template 与 Slash Command

- **字符串模板**：`template.new[==[Hello ${name}!]==]` 生成可复用片段。
- **Page Template**：带 `#meta/template/page` 的页面，作为新建页的蓝图。
- **Slash Template**：带 `#meta/template/slash` 的页面，最后一节路径名即 `/命令`，在光标处插入模板内容。

### 8. Plugs 与 Libraries

**Plugs** 是随发行版自带的 Lua/TS 插件包；**libraries** 目录含标准库脚本、页面模板、slash 模板。高级用户可写自定义 Plug，但多数场景 **Space 内的 space-lua + 模板** 已够用。

### 9. 自托管与安全

默认 Docker/本地常 **无认证**，局域网内任何人可访问——生产环境务必设 **`SB_USER=username:password`**。对外网暴露需 **TLS**（反向代理或官方 Configuration 文档中的 HTTPS 选项）。与 [[foam]]「纯本地 VS Code 扩展」不同，SilverBullet 是 **常驻 Web 服务**，适合树莓派、 homelab VPS、内网 NAS。

---

## 代码示例 1：Docker Compose 启动 Space

官方推荐用 Compose 管理单容器服务。下面是最小可用配置（**务必改掉默认密码**）：

```yaml
# compose.yml — 与 SilverBullet 官方 Install/Docker 文档一致
services:
  silverbullet:
    image: ghcr.io/silverbulletmd/silverbullet:latest
    restart: unless-stopped
    environment:
      - SB_USER=admin:请改成强密码
    volumes:
      - ./space:/space
    ports:
      - "3000:3000"
```

```bash
# 在 compose.yml 所在目录
docker compose up -d
docker compose logs -f

# 浏览器打开 http://localhost:3000 ，用 SB_USER 登录
# 笔记文件落在 ./space/*.md，可直接 git init 做版本管理
```

要点：

- 镜像标签 `:latest` 稳定版，`:v2` 跟踪 main 最新提交（更激进）。
- 容器内 `/space` 的 UID/GID 会跟 host 挂载目录对齐，减少权限踩坑。
- 升级：`docker compose pull && docker compose up -d`；升级后客户端有时需 **刷新两次** 才完全切到新版本。

---

## 代码示例 2：Space Lua 定义 + 行内表达式

在任意页面（或 `Library/` 下的库页）加入 **全局函数**：

````markdown
## 工具函数：两数相加

```space-lua
-- priority: 10
function adder(a, b)
  return a + b
end
```
````

同一 Space 任意页面可写：

```markdown
10 + 2 = ${adder(10, 2)}

<!-- Alt+点击或选中表达式可看到源码 -->
```

再定义一个 **问候模板**（常见于 space-lua 块或配置页）：

```space-lua
greetings = greetings or {}
greetings.sayHello = template.new[==[你好，${name}！今天是 ${date.today}。]==]
```

使用：`${greetings.sayHello { name = "小明" }}`

这展示了 SilverBullet 的核心循环：**Markdown 存内容 → Lua 存逻辑 → `${}` 把逻辑渲染进页面**。

---

## 代码示例 3：SLIQ 查询未完成任务与最近页面

**最近改动的 5 个页面**（首页 Dashboard 常用）：

```markdown
## 最近编辑

${query[[
  from p = index.pages()
  order by p.lastModified desc
  limit 5
  select templates.pageItem(p)
]]}
```

**全库未完成待办**（需任务被正确索引为 task object）：

```markdown
## 待办 inbox

${query[[
  from t = index.tag "task"
  where not t.done
  order by t.pageLastModified desc
  limit 20
  select templates.taskItem(t)
]]}
```

**按 tag 统计**（发现标签使用是否失衡）：

```markdown
${query[[
  from tag = index.tag "tag"
  group by tag.name
  select { tag = name, count = #group }
  order by count desc
  limit 10
]]}
```

SLIQ 返回 Lua table；`select` 里用模板函数时，每一项会渲染成带链接的列表项——任务项甚至可 **勾选同步回源页面**（`templates.taskItem` 的行为以当前版本文档为准）。

---

## 代码示例 4：Slash 模板骨架（会议记录）

创建页面 `Templates/Slash/meet.md`，元数据标记 slash 模板（具体 frontmatter/tag 以 v2 文档 **Template** 页为准），内容示例：

```markdown
# 会议 · ${date.today}

**参与**：
**议程**：

## 决议

- [ ]

## 待办

- [ ] @某人 — 事项 — 截止日期
```

保存后，编辑器输入 `/meet` 可在光标处插入上述结构。与 [[foam]] 的 `.foam/templates/` 类似，但 **命令名来自页面路径**，且可嵌 `${}` 动态日期。

---

## 与相近工具怎么选

| 维度 | SilverBullet | [[foam]] | Obsidian |
|------|--------------|----------|----------|
| 运行形态 | 自托管 Web + PWA | VS Code 扩展 | 桌面/Electron |
| 数据 | 文件夹 Markdown | 文件夹 Markdown | 本地库（含插件云同步） |
| 编程扩展 | Space Lua + SLIQ 内建 | JS 模板 + 社区扩展 | 插件市场 |
| 双向链接 | 有 | 有 | 有 |
| 离线 | PWA 同步整库 | 纯本地 | 本地为主 |
| 适合谁 | 想要 **可编程 PKM + 自托管** | 已在 VS Code 生态 | 插件丰富、开箱 UI |

SilverBullet **不是** [[marktext]] 那种单机所见即所得编辑器；也 **不是** 团队协作 Wiki（如 Confluence）。它的 sweet spot 是：**一个人（或小家庭）** 把 Markdown 空间当成 **可查询、可脚本化的第二大脑**。

---

## 安装方式速览

| 方式 | 说明 |
|------|------|
| **Docker / Compose** | 上文示例；GHCR 与 Docker Hub 均有镜像 |
| **二进制** | 从 [Releases](https://github.com/silverbulletmd/silverbullet/releases) 下载，`./silverbullet /path/to/space` |
| **在线试用** | [silverbullet.md](https://silverbullet.md) 可体验 PWA（数据在官方演示空间，勿放隐私） |
| **开发构建** | 需 Node 24+、Go；`npm install && air /path/to/space` 或 `make build` |

对外访问生产实例：**SB_USER**、**TLS**、定期 **备份 `/space`** 三件套不要省。

---

## 常用操作与快捷键（入门）

- **Page Picker**：快速跳页（类似笔记 App 的全局搜索）。
- **Command Palette**：注册命令与系统命令（含 Reload、Version）。
- **System: Reload**：改 space-lua 后重载脚本而不整页刷新。
- 文档站本身大量 `${widgets.commandButton(...)}` 演示——说明 **文档即 SilverBullet 页面**，meta 与产品一体。

---

## 学习路径建议

1. **Day 1**：Docker 起 Space，写 3 页互相链接，熟悉 Live Preview 与 Page Picker。
2. **Day 2**：加 Tasks、标签，写第一个 `${query[[ from p = index.pages() limit 5 ]]}` dashboard。
3. **Day 3**：读 [Space Lua](https://v2.silverbullet.md/Space%20Lua) 与 [Integrated Query](https://v2.silverbullet.md/Space%20Lua/Integrated%20Query)，复制官方 Library 片段改一改。
4. **Day 4**：做一个 Page Template + Slash Template，统一日记/项目页格式。
5. **Week 2+**：`git init` 备份 space；需要时再研究 Plugs、HTTPS、多设备 PWA 安装。

---

## 常见问题

**Q：和 Obsidian 比，值得迁吗？**  
若你 **必须自托管**、喜欢 **内联 Lua/查询**、不想装 Electron，值得试。若依赖 Obsidian 插件生态或移动端体验，Obsidian 仍更成熟。

**Q：space-lua 和「真 Lua」兼容吗？**  
大体兼容，但有 [Quirks](https://v2.silverbullet.md/Space%20Lua/Quirks)；文档示例常用 ` ```lua ` 展示，**自己 Space 里要用 `space-lua`** 才会激活定义。

**Q：多人协作呢？**  
产品设计偏 **个人** Space；多人同时写同一文件需自行协调（Git 合并 Markdown）。不是 Google Docs 式实时协作。

**Q：AI / LLM 政策？**  
仓库 CONTRIBUTING 提到 [LLM Use policy](https://silverbullet.md/LLM%20Use)——贡献代码前建议阅读。

---

## 小结

SilverBullet 把 **Markdown 文件**、**维基式链接** 和 **Space Lua + SLIQ** 绑在同一套自托管 Web 应用里：笔记不仅是给人读的，还可以 **查、算、模板化、命令化**。入门成本比 [[marktext]] 高（要跑服务、要学 `${query}`），但换来的是 **数据在握、行为可编程** 的个人知识系统——像给书房装上了索引卡片柜和一条可重复执行的小自动化流水线。

**下一步**：Fork 官方 compose 示例，在 `./space` 里建 `Home.md` dashboard，把「最近页面 + 未完成任务」两个 SLIQ 块跑通，再按需加第一个 `/daily` slash 模板。
