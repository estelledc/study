---
title: SilverBullet — 自托管笔记 web 应用
来源: 'https://github.com/silverbulletmd/silverbullet'
日期: 2026-07-07
分类: editors
难度: 初级
---

## 是什么

SilverBullet 是一个**跑在浏览器里的自托管 Markdown 知识库**。日常类比：普通笔记软件像一本本分开的本子；SilverBullet 像一间小资料室，纸还是普通 Markdown，但墙上自动贴出索引、反向链接和待办看板。

最小例子不是先装插件，而是在一页里写普通 Markdown：

```markdown
## 今天

见了 [[Alice]]，聊到 [[Project Phoenix]]。

- [ ] 给 Alice 发会议纪要 [[Project Phoenix]]
```

这三行同时做了三件事：写日记、建立双向链接、生成可查询的任务。SilverBullet 会把文件保存在你的 Space 目录里，再用对象索引把页面、链接、任务等结构提取出来。

它的特别之处是"笔记本身可以变成小程序"。你可以在 Markdown 里写 Space Lua 代码块，用查询语法把一堆页面变成列表、看板或模板。

## 为什么重要

不理解 SilverBullet 的定位，下面这些事会很难解释：

- 为什么有些人不满足于 Obsidian 式本地笔记，而想要一个浏览器能访问、自己能托管的知识库
- 为什么 Markdown 文件也能像数据库一样查询：任务、链接、frontmatter 会被索引成对象
- 为什么"反向链接"会改变记笔记方式：你在日记里提到项目，项目页就自动知道自己被谁提到
- 为什么它不用传统插件商店，也能扩展能力：Space Lua 代码块本身就是 Space 里的可执行配置

## 核心要点

1. **Space 是文件夹，也是知识库**：类比把所有纸放进一个柜子，柜子里每张纸仍能拿出来单独读。SilverBullet 的 Space 是 Markdown 页面集合，迁移时带走目录即可。

2. **Object Index 是自动目录员**：类比图书管理员每隔几秒扫一遍书架，把书名、标签、任务、链接写进卡片盒。查询、页面选择器、Linked Mentions、Linked Tasks 都靠这个索引工作。

3. **Space Lua 把笔记变成工具**：类比在本子边缘贴一张会算数的便签。`space-lua` 代码块在整个 Space 生效，`${...}` 表达式会在 live preview 里显示运行结果。

三条合起来就是：**内容仍是 Markdown，体验却接近一套可编程个人数据库**。

## 实践案例

### 案例 1：用日记自然长出反向链接和任务

官方 Getting Started 文档从 Journal 入手，示例类似这样：

```markdown
* Met with [[Allan]] today to talk about [[Project Phoenix]]:
  * Both happy with project progress
  * [ ] Agree on a better project name [[Allan]]
```

逐部分解释：

- `[[Allan]]` 和 `[[Project Phoenix]]` 是 wiki link，点击后会打开或创建对应页面
- 在 `Allan` 页面上，Linked Mention 会显示这条日记里提到他的上下文
- `- [ ]` 是 Markdown 任务；因为任务也链接了 Allan，它还会出现在 Allan 页的 Linked Tasks 里
- 这个流程的重点是"先按自然语言记录，再让系统自动整理关系"

这适合每天开会、读资料、记联系人和项目推进，不需要先设计复杂分类法。

### 案例 2：把零散任务汇总成项目看板

官方任务管理指南建议先建项目页 frontmatter，再把任务散落在项目页和会议页里：

```markdown
---
tags: project
status: active
priority: high
---

* [ ] Write the project proposal [deadline: "2026-03-15"]
* [ ] Review design mockups [assignee: Alice]
* [ ] Schedule review meeting [[Website Redesign]]
```

逐部分解释：

- `tags: project` 让页面能被当成项目查询
- `[deadline: "..."]` 和 `[assignee: Alice]` 是任务属性，不只是给人看的文字
- `[[Website Redesign]]` 把会议页里的任务连回项目页
- 勾选任务时，源页面和 linked task 视图看到的是同一个任务状态

再建一个 Dashboard 页面，用 SLIQ 查询未完成任务：

```lua
# Open tasks
${query[[
  from t = index.tasks()
  where not t.done
  order by t.lastModified desc
  limit 10
  select templates.taskItem(t)
]]}
```

`index.tasks()` 像"拿出所有任务卡片"，`where not t.done` 只留未完成，`templates.taskItem(t)` 把结果渲染成可读的任务项。

### 案例 3：用 Space Lua 在 Markdown 里写小功能

官方 Space Lua 文档给的最小定义是一个加法函数。实际使用时可以把代码块语言写成 `space-lua`；这里用 `lua` 做等价高亮展示：

```lua
-- adds two numbers
function adder(a, b)
  return a + b
end
```

然后在任意页面里写表达式：

```markdown
10 + 2 = ${adder(10, 2)}
```

逐部分解释：

- `space-lua` 代码块会被索引并在整个 Space 加载，不只属于当前页面
- 没有写成 `local` 的函数会进入全局环境，所以别的页面也能调用 `adder`
- `${...}` 的结果只在 SilverBullet live preview 中显示，原始 Markdown 仍保存表达式
- 修改脚本后要运行 `System: Reload`；如果还改了可索引结构，再运行 `Space: Reindex`

这个案例体现 SilverBullet 和普通 Markdown 编辑器的差异：它允许你把个人工作流写成一小段代码，贴在知识库内部。

## 踩过的坑

1. **把 Space 当成随便同步的云盘目录**：官方安装文档提醒 NAS 或外部同步工具可能影响时间戳；原因是同步引擎依赖可靠的最后修改时间。

2. **在大小写不敏感文件系统上长期部署**：macOS 和 Windows 默认容易踩坑；原因是 SilverBullet 按大小写敏感的页面名和文件名工作。

3. **远程服务器只开 HTTP**：浏览器的 service worker、加密和剪贴板 API 需要 HTTPS 或 localhost；原因是现代浏览器把这些能力视为安全上下文功能。

4. **写完 Space Lua 只看页面没报错**：官方建议检查浏览器控制台；原因是 Lua 语法、加载和渲染错误不一定直接显示在编辑器里。

## 适用 vs 不适用场景

**适用**：

- 想要自托管、浏览器访问、数据仍落在 Markdown 文件里的个人知识库
- 每天写 journal、会议纪要、项目任务，并希望反向链接自动汇总上下文
- 愿意用少量代码定制模板、看板、查询和小组件
- 需要比纯 Markdown 编辑器更强，但又不想把内容锁进私有数据库

**不适用**：

- 只想要最简单的无配置写作台，MarkText 或普通编辑器会更轻
- 完全不想自托管、配置认证、处理 HTTPS 和备份
- 想要多人实时协同、企业权限、复杂评论审批流程
- 不愿意理解 Markdown、frontmatter、查询和 Space Lua 的基本概念

## 历史小故事（可跳过）

- **早期**：SilverBullet 围绕"个人知识数据库"展开，不只做编辑器，还把任务、链接、对象索引放进核心。
- **文档演化**：官方 docs 本身也是项目仓库里的 Markdown 内容，能看到它用自己的模型解释 Space、Object、SLIQ、Page Template。
- **技术栈**：前端是 TypeScript、CodeMirror 6 和 Preact，服务端是 Rust，说明它不是纯前端玩具，而是一个完整自托管系统。
- **2026 年**：GitHub 页面显示五千多 stars、数百 forks，最新 release 仍在更新，社区围绕自托管、local-first 和可编程笔记继续迭代。

这段历史的重点不是"又一个笔记软件"，而是它把 Markdown、wiki、数据库查询和脚本扩展缝到同一个个人工作台里。

## 学到什么

- **Markdown 可以是源真相，也可以被索引成数据库**：文件负责长期保存，Object Index 负责临时加速和查询。
- **反向链接降低整理压力**：先在日记里提人和项目，系统再帮你把上下文送回主题页。
- **可编程笔记的门槛在心智模型**：真正要学的是页面、对象、查询、模板、脚本如何分工。
- **自托管自由也带来运维责任**：HTTPS、认证、文件系统和备份不是附加题，而是日常使用的一部分。

## 延伸阅读

- 官方仓库：[silverbulletmd/silverbullet](https://github.com/silverbulletmd/silverbullet)
- 官方文档：[SilverBullet Docs](https://silverbullet.md)
- 入门路线：[Getting Started](https://silverbullet.md/Getting%20Started)
- 工作流示例：[Task Management Guide](https://silverbullet.md/Guide/Task%20Management)
- 同类对照：[[marktext]] —— 只做实时预览 Markdown 编辑器，更轻但不可编程
- 同类对照：[[affine]] —— 文档和白板结合的知识库路线，重点不在自托管 Markdown 文件

## 关联

- [[markdown-it]] —— SilverBullet 的源内容仍是 Markdown，理解解析器有助于理解扩展语法边界
- [[codemirror]] —— SilverBullet 浏览器编辑体验建立在 CodeMirror 6 之上
- [[marktext]] —— 同样关心 Markdown 写作体验，但 MarkText 更像桌面写作台
- [[affine]] —— 同属知识管理工具，可对比 block 模型和 Markdown 文件模型
- [[yjs]] —— 适合理解协同编辑内核；SilverBullet 的重点不是多人实时协同
- [[code-server]] —— 都把开发或编辑体验搬进浏览器，并牵涉自托管和 HTTPS
- [[docusaurus]] —— 都把 Markdown 变成可浏览站点，但 Docusaurus 面向发布文档，SilverBullet 面向个人知识库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
