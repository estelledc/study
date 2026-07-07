---
title: Joplin — 开源 Evernote 替代
来源: 'https://github.com/laurent22/joplin'
日期: 2026-07-07
分类: editors
难度: 初级
---

## 是什么

Joplin 是一个开源、跨平台、离线优先的 Markdown 笔记和待办应用。

日常类比：它像一个你自己保管钥匙的电子活页夹。Evernote 像把本子放在商店柜台代管，Joplin 则更像本子先放在你包里，需要同步时再寄一份加密副本到云盘。

最小例子可以是这样：

```bash
joplin
:mknote "Wednesday meeting"
:mktodo "Buy bread"
:sync
```

这里 `mknote` 创建普通笔记，`mktodo` 创建待办，`sync` 把本地数据同步到你配置的目标。README 里强调的关键点是：笔记用 Markdown，支持导入 Evernote，支持多端同步和端到端加密。

## 为什么重要

不用 Joplin 这类工具，下面这些事会变得很难：

- 想从 Evernote 搬走，却不想把多年笔记锁进另一个封闭服务。
- 手机、电脑、平板都要能离线看笔记，但重连后又要自动同步。
- 笔记里有隐私内容，希望云端只保存密文，而不是让服务商直接读明文。
- 想继续用 Markdown、外部编辑器、插件和脚本，而不是只能点界面。

Joplin 的价值不是“又一个笔记软件”，而是把个人笔记拆成三个可控部分：文本格式、同步位置、加密钥匙。

## 核心要点

1. **离线优先**。类比：先把地图下载到手机里，没网也能走，联网后再更新路线。Joplin 会在本机保存完整数据，所以断网时仍能读写，连接恢复后再同步。

2. **同步目标可替换**。类比：同一只行李箱可以放进不同寄存柜。官方文档列出 Joplin Cloud、Nextcloud、S3、WebDAV、Dropbox、OneDrive 和本地文件系统，背后靠类似文件系统的读写接口适配。

3. **Markdown + E2EE 组合**。类比：正文是普通纸张，寄出去前套上只有你有钥匙的信封。Markdown 让内容容易导出和编辑，E2EE 让同步目标只看到加密后的数据。

## 实践案例

### 案例 1：在终端里快速记录会议和待办

```bash
joplin
:mknote "Wednesday's meeting"
:mktodo "Buy bread"
:mv $n "Personal"
:config editor "code -w"
:edit $n
```

逐部分解释：

- `mknote` 和 `mktodo` 来自官方终端应用文档，分别创建笔记和待办。
- `$n` 代表当前选中的 note，`mv $n "Personal"` 把它移动到 Personal 笔记本。
- `config editor "code -w"` 把外部编辑器设成 VS Code，之后 `edit $n` 就能用熟悉的编辑器写 Markdown。

这个姿势适合喜欢键盘流的人：Joplin 不是只能点按钮，它也能像一个小型笔记命令行。

### 案例 2：从 Evernote 迁移，再同步到 Nextcloud

```bash
joplin
:import /path/to/old-notes.enex
:config sync.target 5
:config sync.5.path https://example.com/nextcloud/remote.php/webdav/Joplin
:config sync.5.username YOUR_USERNAME
:config sync.5.password YOUR_PASSWORD
:sync
```

逐部分解释：

- `import /path/to/old-notes.enex` 来自官方导入文档，会把 ENEX 文件导入成一个新笔记本。
- `sync.target 5` 在终端客户端里表示 Nextcloud 同步目标。
- `sync.5.path`、`username`、`password` 是 Nextcloud WebDAV 连接信息，最后用 `sync` 开始同步。

这个案例说明 Joplin 的“开源 Evernote 替代”不是口号：它真的提供了 Evernote 导入路径，也允许你把同步放到自己控制的服务上。

### 案例 3：用 Web Clipper API 把脚本结果写进笔记

```bash
TOKEN="ABCD123ABCD123ABCD123ABCD123ABCD123"

curl --data '{ "title": "Build notes", "body": "CI passed in **12 min**" }' \
  "http://127.0.0.1:41184/notes?token=$TOKEN"

curl "http://127.0.0.1:41184/notes?order_by=updated_time&order_dir=ASC&limit=10&token=$TOKEN"
```

逐部分解释：

- Web Clipper 服务由桌面应用启动，官方说明它也能被其他应用用来创建、修改、删除 notes、notebooks 和 tags。
- 第一条 `curl` 调 `POST /notes`，把一段 Markdown 创建成笔记。
- 第二条按更新时间拉最近的笔记列表，适合脚本做备份、日报汇总或自动归档。

这不是要新手一上来写插件，而是知道 Joplin 不只是“人手写笔记”，也能接自动化工具。

## 踩过的坑

1. **把 E2EE 同时在多台设备上打开**：官方建议先在一台设备启用并同步，再让其他设备接收 master key，否则可能出现多个加密 key。

2. **忘记 E2EE 密码**：主密码无法被服务端恢复；重置只会让旧密钥失效，旧内容可能再也解不开。

3. **以为 Evernote 导入 100% 还原**：ENEX 里复杂样式和某些笔记链接信息不完整，Joplin 会尽量转换，但颜色、字体和重名链接可能不完美。

4. **在手机同步超大附件**：官方附件文档提醒移动端目前不支持大于 10 MB 的资源，同步时可能导致应用崩溃。

## 适用 vs 不适用场景

**适用**：

- 个人长期知识库：日记、会议、读书、代码片段都想保存在可导出的 Markdown 里。
- 隐私笔记：账号线索、健康记录、私人想法需要端到端加密同步。
- 多设备离线写作：地铁、飞机、弱网环境也要能改笔记。
- 喜欢折腾：愿意配置 WebDAV、插件、外部编辑器或 API 自动化。

**不适用**：

- 只想多人实时协作编辑同一页：Joplin 更偏个人笔记，实时协作不是主能力。
- 完全不想碰同步配置：Joplin Cloud 最省心，但自托管和第三方同步仍需要理解账号、路径和冲突。
- 重度富文本排版：Joplin 支持富文本编辑器，但核心模型仍是 Markdown。
- 想要 Notion 式数据库视图和权限工作流：Joplin 的强项是笔记，不是团队表格系统。

## 历史小故事（可跳过）

- 2016 年，Laurent Cozic 开始维护 Joplin，目标是做一个开放、可同步、可导入 Evernote 的个人笔记工具。
- 早期 Joplin 抓住了两个痛点：Evernote 迁移和离线优先，吸引了一批希望掌控数据的用户。
- 后来项目逐步补齐桌面、移动、终端、Web Clipper、插件和 Joplin Server，形成完整生态。
- 到 2026 年，GitHub 仓库已经是 5 万 star 级别项目，仍保持开源社区开发节奏。

## 学到什么

- 好的笔记工具不只是编辑器，还要回答“数据在哪里、谁能读、坏了怎么搬走”。
- Markdown 降低迁移成本，E2EE 降低托管风险，同步驱动降低平台绑定。
- 离线优先的代价是冲突、初次同步和附件体积都要被认真处理。
- 对新手来说，先用桌面端 + 一个同步目标跑通，再逐步学终端、插件和 API，最稳。

## 延伸阅读

- 官方仓库：[laurent22/joplin](https://github.com/laurent22/joplin)
- 官方文档入口：[What is Joplin?](https://joplinapp.org/help/)
- 终端应用文档：[Joplin Terminal Application](https://joplinapp.org/help/apps/terminal/)
- 加密说明：[End-To-End Encryption](https://joplinapp.org/help/apps/sync/e2ee/)
- API 参考：[Joplin Data API](https://joplinapp.org/help/api/references/rest_api/)
- [[logseq]] —— 同样是本地优先笔记，但更强调块和双链图谱

## 关联

- [[logseq]] —— 同样服务个人知识库，适合对比“块结构”与“笔记本结构”
- [[foam]] —— VS Code 里的 Markdown 双链方案，比 Joplin 更贴近纯文件工作流
- [[marktext]] —— 纯 Markdown 写作体验更轻，但同步和 E2EE 不是核心
- [[emacs]] —— Org-mode 用户能理解 Joplin 终端与外部编辑器路线
- [[libsignal]] —— 端到端加密的直觉相同：传输方不应读到明文
- [[sops]] —— 都在解决“内容可以同步，但密钥要自己掌握”的问题

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
