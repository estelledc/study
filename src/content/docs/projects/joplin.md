---
title: Joplin — 开源 Evernote 替代
来源: https://github.com/laurent22/joplin
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：把「带锁抽屉的笔记本柜」搬进自己家里

想象你有一组 **活页笔记本**：每一本是一个主题（工作、读书、旅行），每一页是一条笔记，页角贴彩色标签方便检索，还可以夹照片、PDF 当附件。Evernote 像租了一间 **托管仓库**——方便，但箱子格式是房东定的，涨价或关门时，搬运会疼。

**Joplin 像把同款柜子买回家**：笔记默认存在你电脑/手机本地，正文是 **Markdown 纯文本**（不是专有富文本黑盒），你可以用任意编辑器打开；想备份就拷贝文件夹，想同步就自己选 Dropbox、Nextcloud、WebDAV、OneDrive 或 Joplin Cloud，甚至可选 **端到端加密**，云端只看到密文。浏览器装 **Web Clipper** 还能把网页「撕下来」塞进指定笔记本——和 Evernote 剪藏类似，但数据主权在你手里。

Joplin 由 Laurent Cozic 发起，是 AGPL 许可的开源跨平台笔记与待办应用（[laurent22/joplin](https://github.com/laurent22/joplin)），桌面端基于 Electron + SQLite，移动端基于 React Native，另有终端版 CLI。零基础路径：**安装桌面版 → 建第一个笔记本 → 写一条 Markdown 笔记 → 试同步/导出 → 按需启用 Web Clipper 或 CLI 自动化**。

---

## 这个项目解决什么问题

### 痛点 1：专有格式与供应商锁定

Evernote 的 ENEX、内部格式与订阅绑定，迁移成本高。Joplin **原生支持导入 ENEX**（含附件与元数据），日常存储为 Markdown；可导出 **JEX**（完整归档）、**MD**、**RAW** 等，避免「笔记只能活在一个 App 里」。

### 痛点 2：隐私与离线可用

笔记 **offline first**：无网也能读写、全文搜索；同步是可选层，不是前提。配合 E2EE，同步目标（包括自建 WebDAV）无法读取明文。

### 痛点 3：跨平台与剪藏

官方提供 Windows / macOS / Linux / Android / iOS / Terminal 客户端，并维护 Firefox、Chrome **Web Clipper**。剪藏可选笔记本、标签，支持简化页面或完整 HTML。

### 痛点 4：可扩展

**插件系统**（多进程沙箱）可扩展编辑器、主题、导入导出格式；**Data API**（REST，默认 `localhost:41184`）供脚本、插件、自动化写入笔记——适合把 RSS、邮件、CI 日志接进知识库。

---

## 核心概念拆解

### 1. Notebook（笔记本 / Folder）

笔记的容器，支持 **嵌套子笔记本**（类似 Evernote 堆叠）。每条笔记属于且仅属于一个笔记本（可通过移动变更）。在数据模型里对应 `Folder`。

### 2. Note（笔记）

最小内容单元，字段含 `title`、`body`（Markdown）、`created_time`、`updated_time`、`user_updated_time` 等。支持 **待办语法**：`- [ ]` / `- [x]`，与正文混排。内置 **版本历史**（默认约 90 天），可回溯或恢复旧稿。

### 3. Tag（标签）

跨笔记本的横向分类，一条笔记可打多个标签。与笔记本正交：适合「#面试」「#待整理」这类贯穿项目的标记。

### 4. Resource（资源 / 附件）

图片、PDF 等二进制附件，在 Markdown 里以 `![](:resource_id)` 或类似内部链接引用；同步时与笔记一并上传。导入 Evernote 时会从 ENEX 还原资源。

### 5. 同步（Sync）与驱动抽象

Joplin **没有强制官方云**（另有可选 Joplin Cloud 服务）。同步通过 **轻量驱动** 对接文件系统式后端：Dropbox、OneDrive、Nextcloud、WebDAV、本地目录等。逻辑在抽象层完成，换后端不必改笔记格式。

### 6. 端到端加密（E2EE）

在同步层可选开启：密钥由用户掌握，服务器/网盘只见加密 blob。适合把笔记放在不可信第三方存储上。注意：**丢失主密码无法恢复**，需自行备份密钥。

### 7. 导入导出（Interop）

| 格式 | 用途 |
|------|------|
| ENEX | 从 Evernote 迁入 |
| JEX | Joplin 完整交换格式（多笔记 + 资源打包） |
| MD / RAW | 与外部 Git、编辑器协作 |
| HTML | 主要桌面 GUI 导出 |

### 8. 插件架构（简述）

插件脚本在 **独立进程** 运行，通过 IPC 调用主进程 API，崩溃不拖垮主程序。桌面端用 `BrowserWindow` 隔离；API 分平台实现（桌面有编辑器相关接口，移动端子集）。详见仓库 `readme/dev/spec/plugins.md`。

### 9. Data API / Web Clipper 服务

在桌面端 **Web Clipper 选项** 中启动本地 REST 服务（常见端口 **41184**）。外部请求需带 **token** 查询参数。插件在 Clipper 未启动时也可走内部 API。

### 10. Joplin 不是什么

它不是实时协作白板（无 Google Docs 式共编）；不是块级双链图谱（那是 Logseq / Obsidian 强项）；不是公司统一知识库 SaaS。它的核心是 **隐私优先的 Markdown 笔记柜 + 可选同步 + 剪藏与自动化接口**。

---

## 安装与第一次打开

### 桌面端（推荐）

1. 从 [joplinapp.org](https://joplinapp.org) 或 [GitHub Releases](https://github.com/laurent22/joplin/releases) 安装对应平台包。
2. 启动后 **创建笔记本**，例如 `Inbox`、`学习笔记`。
3. 新建笔记，在设置中确认默认编辑器为 **Markdown**（亦可切换所见即所得）。
4. **工具 → Web Clipper 选项**：记下端口与 token，供 API/剪藏扩展使用。
5. （可选）**工具 → 选项 → 同步**：配置 WebDAV / Nextcloud 等，先小范围试同步再全量。

### 终端 CLI

安装桌面版后通常附带 `joplin` 命令（或单独装 `joplin-cli`）。适合脚本化导入导出、无头服务器定时任务。

### 从 Evernote 迁移

在 Evernote 导出 **ENEX**（按笔记本），Joplin：**文件 → 导入 → ENEX**，选择目标笔记本。大批量导入建议先用 CLI 观察日志。

---

## 代码示例 1：CLI 导入、导出与同步

以下命令假设已安装 CLI 且 profile 已初始化（首次运行 `joplin` 会提示配置目录）。

```bash
# 从 Evernote 导出的 ENEX 导入到默认笔记本
joplin import --format enex /path/to/evernote-export/MyNotebook.enex

# 仅导出某一笔记本为 Markdown 目录（便于放进 Git）
joplin export --format md --notebook "学习笔记" /tmp/joplin-md-export

# 导出完整 JEX 归档（含资源，适合整机备份）
joplin export --format jex /tmp/backup-$(date +%Y%m%d).jex

# 同步到已在选项里配置好的目标（WebDAV / Dropbox 等）
joplin sync

# 列出最近更新的 5 条笔记（排查脚本是否写入成功）
joplin notes -l 5
```

**阅读要点：**

- `import --format enex` 会解析 Evernote 标签、资源与创建时间；超大 ENEX 耗时会变长，属正常现象。
- `export --format md` 得到的是 **可读 Markdown 树**，适合与 `logseq` / `Obsidian` 联用，但 Joplin 特有元数据可能简化。
- `sync` 前务必在 GUI 或 `joplin config` 中配好同步目标；E2EE 开启后各客户端需同一密钥。
- CLI 与 GUI 共享同一 SQLite 数据库，**不要两边同时大批量导入**以免锁冲突。

---

## 代码示例 2：Data API — 用 curl 创建与检索笔记

在 Joplin 桌面端启用 Web Clipper 服务后，将 `YOUR_TOKEN` 替换为选项页中的 token：

```bash
# 列出笔记（分页参数可选）
curl -s "http://localhost:41184/notes?token=YOUR_TOKEN&limit=10" | jq .

# 在指定笔记本创建一条 Markdown 笔记（parent_id 为笔记本 ID）
curl -s -X POST "http://localhost:41184/notes?token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "API 写入测试",
    "body": "## 小节\n\n- [ ] 待办项\n- 正文支持 **粗体** 与 `代码`",
    "parent_id": "NOTEBOOK_ID_HERE"
  }'

# 按关键字搜索（全文检索接口）
curl -s "http://localhost:41184/search?token=YOUR_TOKEN&query=Joplin&type=note" | jq .
```

用 Python 批量写入时的最小模式（与本机 Clipper 服务对话）：

```python
import json
import urllib.request

TOKEN = "YOUR_TOKEN"
BASE = f"http://localhost:41184/notes?token={TOKEN}"

payload = {
    "title": "日报 2026-06-13",
    "body": "- 完成 Joplin 笔记\n- 同步状态：OK",
    "parent_id": "NOTEBOOK_ID_HERE",
}
req = urllib.request.Request(
    BASE,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req) as resp:
    print(resp.read().decode())
```

**阅读要点：**

- 所有请求必须带 `token`；勿把 token 提交到公共仓库。
- `parent_id` 可通过 `GET /folders` 获取笔记本列表后填入。
- 创建时可用 `body`（Markdown）或 `body_html`（HTML），二选一。
- 自动化场景（RSS、Zapier 自托管替代）常用此 API；Jan-Piet Mens 曾用类似方式把推文归档进 Joplin。

---

## 代码示例 3：插件 — 注册 JSON 导出模块（节选）

插件在独立进程加载，通过 `joplin.interop.registerExportModule` 扩展导出格式。以下为仓库内测试插件 `json_export` 的核心结构（TypeScript）：

```typescript
import joplin from 'api';
import { FileSystemItem } from 'api/types';

joplin.plugins.register({
  onStart: async function () {
    await joplin.interop.registerExportModule({
      description: 'JSON Export Directory',
      format: 'json',
      target: FileSystemItem.Directory,
      isNoteArchive: false,

      onInit: async (context) => {
        await fs.mkdirp(context.destPath);
        await fs.mkdirp(`${context.destPath}/resources`);
      },

      onProcessItem: async (context, _itemType, item) => {
        const filePath = `${context.destPath}/${item.id}.json`;
        await fs.writeFile(filePath, JSON.stringify(item), 'utf8');
      },

      onProcessResource: async (context, _resource, filePath) => {
        const dest = `${context.destPath}/resources/${path.basename(filePath)}`;
        await fs.copy(filePath, dest);
      },
    });
  },
});
```

**阅读要点：**

- 生命周期钩子：`onInit` → 逐条 `onProcessItem` / `onProcessResource` → `onClose`。
- `format` 与文件扩展名由模块声明；导入侧需另实现 `registerImportModule`（往往更复杂，要避免 ID 冲突）。
- 开发插件可用官方 generator，打包后在 **设置 → 插件** 安装 `.jpl`。
- 多进程设计意味着插件死循环不会直接冻结主 UI，但应谨慎处理异步与文件 I/O。

---

## 本地数据长什么样

桌面版配置目录（因平台而异，macOS 常见在 `~/.config/joplin-desktop` 或应用数据路径）内含 **SQLite 数据库** `database.sqlite`，笔记正文以 Markdown 存在库中，资源在 `resources/` 子目录。你日常不必手改数据库；备份请用 **JEX 导出** 或同步目标上的副本，而不是直接复制正在写入的 DB 文件。

单条笔记在 UI 里的 Markdown 示例：

```markdown
# 周会纪要 2026-06-13

参会：[[张三]]、[[李四]]

## 结论

- [ ] 跟进 API 限流方案
- [x] 确认 Joplin 同步窗口改为夜间

## 附件

![架构草图](:/abc123def456.png)
```

标签在 UI 中单独管理，不会全部写进 Markdown 文件头；这与「纯文本优先」的 Obsidian  frontmatter 习惯不同，迁移时要靠导出选项或插件补齐元数据。

---

## 推荐工作流（零基础 7 天）

| 天 | 动作 | 目标 |
|----|------|------|
| 1 | 建 `Inbox` + 写 3 条纯 Markdown | 熟悉笔记本与编辑器 |
| 2 | 安装浏览器 Web Clipper，剪 2 篇文 | 理解笔记本目标与标签 |
| 3 | 用 `- [ ]` 做待办清单 | 笔记 + 任务合一 |
| 4 | 配置一种同步（或明确「仅本地」） | 理解 offline first |
| 5 | `joplin export --format md` 备份 | 感受数据可搬运 |
| 6 | 试 `curl` 创建一条 API 笔记 | 打开自动化想象空间 |
| 7 | 浏览社区插件（日历、大纲增强等） | 按需扩展，避免一次装太多 |

---

## 与相近工具对比（简表）

| 维度 | Joplin | Evernote | Obsidian | Standard Notes |
|------|--------|----------|----------|----------------|
| 开源 | ✅ AGPL | ❌ | 闭源免费 | ✅ 部分 |
| 默认存储 | 本地 SQLite + MD | 云专有 | 本地 MD 文件 | 加密文稿 |
| Evernote 导入 | ✅ ENEX | — | 需插件 | 有限 |
| 块级双链 | ❌ | ❌ | ✅ | ❌ |
| 官方剪藏 | ✅ | ✅ | 第三方 | ❌ |
| 同步 | 多后端可选 | 官方云 | 第三方插件 | 官方同步 |
| CLI / REST | ✅ 强 | 弱 | 插件 | 有限 |

若你已从 Evernote 迁出、重视 **Markdown + 自托管同步 + 剪藏**，Joplin 往往是阻力最小的第一站；若你更需要 **wikilink 图谱**，可再把 Joplin 导出 MD 迁入 Obsidian / Logseq。

---

## 常见问题

**Q：Joplin 和 Obsidian 选哪个？**  
Joplin 偏「全能笔记 App + 同步 + 剪藏」，开箱自带移动端与 ENEX；Obsidian 偏「本地 MD 知识库 + 插件生态」。可以 Joplin 采集，定期 MD 导出到 Obsidian 做图谱。

**Q：同步冲突怎么办？**  
保留冲突副本笔记，手动合并后删除多余版本。避免多设备同时大规模重命名笔记本。

**Q：E2EE 和网盘加密一样吗？**  
不一样。E2EE 在 Joplin 客户端加密后再上传，网盘厂商无法读正文；网盘自带加密通常仍由厂商控钥。

**Q：插件安全吗？**  
只装来源可信的插件；插件能访问 API 与部分 UI。更新 Joplin 后偶尔需等待插件兼容新版本。

**Q：命令行 `joplin` 找不到？**  
确认安装的是桌面集成版，或参考文档安装 CLI 包；macOS 有时需把 `joplin` 链接到 `PATH`。

---

## 延伸资源

- 官方文档：[joplinapp.org/help](https://joplinapp.org/help/)
- 同步说明：[readme/apps/sync](https://github.com/laurent22/joplin/blob/dev/readme/apps/sync/index.md)
- Data API：[REST API 参考](https://joplinapp.org/help/api/references/rest_api/)
- 插件开发：[Plugin API](https://joplinapp.org/api/references/plugin_api/)
- 社区论坛：[discourse.joplinapp.org](https://discourse.joplinapp.org/)
- 开源介绍：[Opensource.com — Joplin](https://opensource.com/article/17/12/joplin-open-source-evernote-alternative)

---

## 小结

Joplin 用 **Markdown 笔记 + 本地优先 + 可选多后端同步** 回应 Evernote 式需求：笔记本与标签组织信息，资源挂附件，Web Clipper 收网页，CLI 与 REST API 接自动化。它不把你的记忆锁在单一云服务里——**柜子在你家，钥匙在你手**，同步只是你把备份副本放到选定的远处货架。零基础先写起来、再配同步与导出；当你需要把外部世界持续灌进笔记本时，API 与插件会把 Joplin 从「记事本」推进成个人知识管道的枢纽。
