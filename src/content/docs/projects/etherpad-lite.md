---
title: Etherpad — 经典协作文本编辑器
来源: https://github.com/ether/etherpad-lite
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：会议室里的「共享记事本」

想象你和三位同事在白板前开头脑风暴：有人打字、有人改标题、有人删错字——**所有人盯着同一块屏幕**，不用等 A 改完发 Word、B 再合并第 9 版。

**Etherpad Lite**（[ether/etherpad-lite](https://github.com/ether/etherpad-lite)）就是浏览器里的 **共享记事本**：

- **Pad（便笺）** 是一页可无限滚动的纯文本/富文本——每个 URL 对应一个 pad，打开就能写。
- **实时同步** 像 Google Docs 的早期形态：你每敲一个键，其他人的屏幕几毫秒内跟上；每人光标旁还有 **彩色作者标识**（谁在哪一行改的一目了然）。
- **Changeset（变更集）** 是底层「编辑指令」——不是整页覆盖，而是「在第 42 个字符后插入 hello」这类增量操作，服务器用 **Operational Transformation（OT）** 合并多人同时提交的 edits，保证最终文本一致。
- **自托管** 意味着数据在你自己的 Node.js 进程 + 数据库里，而不是某个 SaaS 的黑盒；Wiki 文档称可 **扩展到数千并发编辑者**（[scale.etherpad.org](http://scale.etherpad.org/)）。

与 HedgeDoc（Markdown + 幻灯片）或 Overleaf（LaTeX 编译）不同，Etherpad 的初心是 **极简、实时、可嵌入**：一条 `/p/xxx` 链接、一个 iframe，就能给任意网站挂上协作编辑。官方插件目录见 [static.etherpad.org](https://static.etherpad.org/)；文档 [docs.etherpad.org](https://docs.etherpad.org/)。

零基础路径：**Docker 起一个实例 → 浏览器打开默认 pad → 开隐身窗口模拟第二人 → 试 HTTP API 创建 pad → 装一个 ep_ 插件**。

---

## 这个项目解决什么问题

### 痛点 1：协作靠邮件/IM 传文档，版本爆炸

站会记录、临时方案、活动文案——用 Word 或飞书可以，但 **内网实验室、开源社区、不想把草稿交给第三方** 的场景需要自建。Etherpad 给 **一条 URL + 零客户端安装**，打开即写、写完即分享。

### 痛点 2：只想嵌入「一块可编辑区域」，不想重做编辑器

Etherpad 从设计之初就支持 **iframe 嵌入** 和 **HTTP API**：你的门户（WordPress、LMS、内部 OA）负责登录，Etherpad 负责 **pad 生命周期 + 实时 OT**。权限通过 **Session / Group / Author** 映射，而不是在 Etherpad 里再造一套用户系统。

### 痛点 3：功能需求各异，核心却要轻量

默认安装很「瘦」——粗体、列表、作者颜色、侧边 chat。需要 Markdown 导出、标题、评论页、WebRTC 语音？通过 **`ep_` 前缀插件** 按需加装，不必 fork 主仓库。

### 痛点 4：数据主权与导出

支持 **HTML / Etherpad / 纯文本** 等导出路径，插件可扩展 `getLineHTMLForExport` 等 hook。对比闭源 SaaS，**Full Data Export** 能力在 Wiki 中有专门说明，适合合规归档。

---

## 核心概念拆解

### 1. Pad：协作文档的原子单位

每个 pad 有唯一 **padID**：

| 类型 | padID 格式 | 说明 |
|------|------------|------|
| 公开 pad | `my-meeting-notes` | 任意访客可创建（除非 `editOnly`） |
| Group pad | `g.xxxxx$padName` | 属于某个 group，常配合 Session 控权 |

内容在服务端存为 **一串 revision + changeset**，而不是每次全量快照。读历史 revision 可还原任意时刻（API：`getRevisionChangeset`）。

### 2. Author / Group / Session：把「你的用户系统」接到 Etherpad

Etherpad **不做完整账号体系**（可配 admin 密码、OpenID Connect 插件），推荐模式是：

1. **Author**：`createAuthorIfNotExistsFor(authorMapper)` 把业务侧 user id 映射为 `a.xxxxx`
2. **Group**：`createGroupIfNotExistsFor(groupMapper)` 把「项目 / 课程 / 租户」映射为 `g.xxxxx`
3. **Session**：`createSession(groupID, authorID, validUntil)` 发 cookie，浏览器才能编辑该 group 下的 pads

类比：Author 是「员工工牌」，Group 是「部门」，Session 是「今日门禁卡」。

### 3. Operational Transformation 与 Changeset

多人同时编辑时，客户端把本地操作编码为 **changeset 字符串**（如 `Z:1>6b|5+6b$Welcome...`），经 WebSocket 发到服务器；服务器 **变换（transform）** 并发 changeset 后追加为新 revision。你不需要手写 OT，但要理解：**冲突合并在服务端完成**，客户端只负责展示合并后的 Ace Editor 视图。

### 4. 插件框架：ep.json + Hooks

插件名惯例 **`ep_`** 开头，在 `ep.json` 里注册：

- **Server hooks**：`expressCreateServer`、`padCreate`、`authorize`、`authenticate`…
- **Client hooks**：`postAceInit`、`aceEditEvent`、`padInitToolbar`…

安装：`pnpm run plugins i ep_markdown`（在 Etherpad 根目录）。详见 [docs.etherpad.org/plugins](https://docs.etherpad.org/plugins.html)。

### 5. HTTP API 与 OpenAPI

REST 形态：`/api/{version}/{functionName}`，响应统一 `{ code, message, data }`。OpenAPI 定义在 `/api/openapi.json`。自 **1.8** 起大文本（如 `setText`）应用 **POST** 传 body，避免 GET 头 8KB 限制。

认证：OAuth Bearer token（`settings.json` 的 `sso` 段配置 client）。

---

## 快速上手：Docker 一键运行

官方镜像 `etherpad/etherpad:latest`，配合 PostgreSQL 持久化：

```yaml
# docker-compose.yml 片段
services:
  app:
    image: etherpad/etherpad:latest
    ports:
      - "9001:9001"
    environment:
      TITLE: "My Etherpad"
      DEFAULT_PAD_TEXT: "Welcome!\n\nStart typing..."
      DB_TYPE: postgres
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: etherpad
      DB_USER: admin
      DB_PASS: admin
      ADMIN_PASSWORD: changeme
    depends_on:
      - postgres
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: admin
      POSTGRES_DB: etherpad
```

启动后访问 `http://localhost:9001`——默认 pad 文案会解释「输入即同步」。环境变量覆盖规则见仓库 `settings.json.docker`：几乎每项都可 `${ENV_VAR:default}` 注入，无需重建镜像即可调参。

---

## 代码示例 1：HTTP API — 门户为用户创建 Group Pad

场景：内部 Wiki 用户 id=`7`、显示名 Michael，要为其创建私有 pad 并 iframe 嵌入。

**步骤 1 — 映射 Author**

```bash
curl -s "http://localhost:9001/api/1/createAuthorIfNotExistsFor" \
  --get \
  --data-urlencode "name=Michael" \
  --data-urlencode "authorMapper=7" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
# => {"code":0,"message":"ok","data":{"authorID":"a.s8oes9dhwrvt0zif"}}
```

**步骤 2 — 映射 Group 并创建 pad**

```bash
curl -s "http://localhost:9001/api/1/createGroupIfNotExistsFor" \
  --get --data-urlencode "groupMapper=7" \
  -H "Authorization: Bearer YOUR_API_TOKEN"

curl -s "http://localhost:9001/api/1/createGroupPad" \
  --get \
  --data-urlencode "groupID=g.s8oes9dhwrvt0zif" \
  --data-urlencode "padName=weekly-standup" \
  --data-urlencode "text=## Standup\n\n- Yesterday:\n- Today:\n" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

**步骤 3 — 签发 Session（cookie）**

```bash
VALID_UNTIL=$(($(date +%s) + 86400))  # 24 小时后过期
curl -s "http://localhost:9001/api/1/createSession" \
  --get \
  --data-urlencode "groupID=g.s8oes9dhwrvt0zif" \
  --data-urlencode "authorID=a.s8oes9dhwrvt0zif" \
  --data-urlencode "validUntil=$VALID_UNTIL" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
# => {"code":0,"data":{"sessionID":"s.xxxxx"}}
```

门户把 `sessionID` 写入浏览器 cookie，再嵌入：

```html
<iframe
  src="http://localhost:9001/p/g.s8oes9dhwrvt0zif$weekly-standup"
  width="100%"
  height="600"
  frameborder="0"
></iframe>
```

用户登出时调用 `deleteSession(sessionID)` 吊销门禁卡。

---

## 代码示例 2：Node.js 批量写入 pad 内容

长文档应走 **POST**（>8KB 时 GET 会踩 Node 请求头上限）：

```javascript
// scripts/seed-pad.mjs — 用 API 初始化 pad 正文
const BASE = 'http://localhost:9001';
const TOKEN = process.env.EP_API_TOKEN;
const padID = 'onboarding-checklist';

const text = `# 新人 Onboarding

1. 申请 VPN
2. 阅读安全规范
3. 加入 #general 频道
`.repeat(20); // 故意拉长，演示 POST

const res = await fetch(`${BASE}/api/1/setText`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({ padID, text }),
});

const json = await res.json();
if (json.code !== 0) throw new Error(json.message);
console.log('pad seeded:', padID);
```

配合 `getText` / `getHTML` 可把 pad 定稿 **拉回 CMS 发博客**——官方 HTTP API 文档 Example 2 就是「多管理员改 pad → API 取文本 → 入库」。

---

## 代码示例 3：最小插件 — 在 pad 创建时写日志

`src/plugin_packages/ep_hello/ep.json`：

```json
{
  "parts": [
    {
      "name": "main",
      "hooks": {
        "padCreate": "ep_hello/index:onPadCreate"
      }
    }
  ]
}
```

`src/plugin_packages/ep_hello/index.js`：

```javascript
exports.onPadCreate = (hookName, context, cb) => {
  console.log('[ep_hello] new pad:', context.padId);
  cb();
};
```

重启 Etherpad 后，每次 `createPad` / `createGroupPad` 都会在服务端日志出现 pad id。更复杂的需求（自定义 toolbar、导出 HTML 标签）可挂 `padInitToolbar`、`exportHtmlAdditionalTags` 等 hook。

---

## settings.json 里值得先改的几项

| 键 | 作用 |
|----|------|
| `title` | 浏览器标签页标题 |
| `defaultPadText` | 新建 pad 的初始文案 |
| `requireSession` | `true` 时必须有 Session，相当于只允许 group pad |
| `editOnly` | `true` 时用户不能 UI 新建 pad，只能 API 创建 |
| `minify` | 生产环境压缩 JS/CSS |
| `dbType` / `dbSettings` | 默认 SQLite；生产用 PostgreSQL |

插件配置也可用环境变量：`EP__ep_comments_page__highlightSelectedText=true`（路径用双下划线分隔）。

---

## 常用插件（按需安装）

官方 README 建议的一包「增强写作体验」：

```sh
pnpm run plugins i \
  ep_align ep_comments_page ep_embedded_hyperlinks2 \
  ep_font_color ep_headings2 ep_markdown ep_webrtc
```

| 插件 | 能力 |
|------|------|
| `ep_markdown` | Markdown 语法与导出 |
| `ep_headings2` | 标题层级 |
| `ep_comments_page` | 侧边评论页 |
| `ep_openid_connect` | 对接企业 IdP 登录 |

---

## Etherpad vs 其他协作编辑器

| 维度 | Etherpad Lite | HedgeDoc | Google Docs |
|------|---------------|----------|-------------|
| 定位 | 轻量 embed + API | Markdown 知识库 | 全功能办公 |
| 协同算法 | OT + changeset | Yjs CRDT（v2） | 专有 OT/CRDT |
| 自托管 | 一等公民 | AGPL 自建 | 否 |
| 嵌入/API | HTTP API + iframe | 相对弱 | 有限 API |
| 格式 | 富文本为主 | Markdown 中心 | 富文本 + 表格 |

选 Etherpad 当你需要 **把实时编辑嵌进已有 Web 应用**，且愿意自己管 Session/Group 映射。

---

## 架构一瞥（零基础版）

```text
Browser A ──WebSocket──┐
Browser B ──WebSocket──┼──► Node.js (Express + Socket.IO)
Browser C ──WebSocket──┘         │
                                 ├──► PadManager (OT, revisions)
                                 ├──► Plugin hooks (ep_*)
                                 └──► DB (SQLite / Postgres / …)
HTTP API ──REST──────────────► 同上
```

Ace Editor 负责前端渲染；`clientVars` hook 可向浏览器注入额外配置（例如插件开关）。

---

## 常见坑与排查

1. **API 返回 code 4**：Bearer token 错误或 `sso` 未配置 client credentials。
2. **Group pad 403**：未设置 Session cookie，或 `requireSession: true` 但用了公开 pad。
3. **setText 失败 text too long**：改用 POST；检查是否仍把全文塞在 GET query。
4. **插件不生效**：确认目录在 `src/plugin_packages`，且 `ep.json` 路径与 hook 函数导出一致；看启动日志有无 `Plugin loaded: ep_xxx`。
5. **iframe 跨域 cookie**：Session cookie 需 **SameSite / 域名** 与父页面策略一致，否则嵌入后「只读访客」。

---

## 延伸学习

- [HTTP API 完整方法列表](https://github.com/ether/etherpad-lite/blob/develop/doc/api/http_api.md)
- [Server-side hooks 参考](https://docs.etherpad.org/api/hooks_server-side.html)
- [Docker 部署说明](https://github.com/ether/etherpad-lite/blob/develop/doc/docker.md)
- Wiki：[HTTP API client libraries](https://github.com/ether/etherpad-lite/wiki/HTTP-API-client-libraries)（多语言 SDK）

---

## 小结

Etherpad Lite 是 **2011 年代至今仍在演进的开源实时协作编辑器**：Pad + OT/changeset 保证多人同步；Author/Group/Session 把外部账号接进来；HTTP API 与 iframe 让它成为 **可编程的协作组件** 而非孤立 SaaS。零基础先 **Docker 跑起来、双人试打字、curl 调一次 createGroupPad**；进阶再写 `ep_` 插件或对接 OpenID。数据在你服务器上，链接即房间——这就是它「经典」的原因。
