---
title: Etherpad — 经典协作文本编辑器
来源: 'https://github.com/ether/etherpad'
日期: 2026-07-08
分类: editors
难度: 中级
---

## 是什么

Etherpad 是一个**自托管的实时多人文本编辑器**：几个人打开同一个 pad 链接，就能同时打字、看到作者颜色、回放历史版本。

日常类比：它像会议室桌上的同一张纸，只是每个人的笔用不同颜色标出来，谁什么时候写了哪句话都能倒带查看。

最小例子不是先写插件，而是先把服务跑起来：

```bash
curl -fsSL https://raw.githubusercontent.com/ether/etherpad/master/bin/installer.sh | sh
cd etherpad-lite
pnpm run prod
```

然后打开 `http://localhost:9001`，新建一个 pad，把链接发给别人。这个体验背后的重点是：浏览器里每一次编辑都被拆成可合并的小操作，服务器负责排队、广播和保存历史。

Etherpad 的价值不是“又一个在线文档”，而是“你可以把协作编辑这件事放在自己的服务器里”。官方 README 强调作者归属、完整修订历史、timeslider、插件生态和自托管治理，这些正好是很多机构不想完全交给外部 SaaS 的部分。

## 为什么重要

不理解 Etherpad，下面这些事会很难解释：

- 为什么浏览器里两个人同时改同一行字，最后不会直接互相覆盖：编辑操作需要按顺序转换和合并。
- 为什么协作文档的“历史回放”比普通自动保存复杂：它保存的是一串修订，不只是最后一份文本。
- 为什么自托管编辑器仍然有市场：学校、公共机构、新闻团队和社区项目常常需要控制数据、账号和导出。
- 为什么插件生态是核心能力：基础安装很轻，评论、标题、Markdown、登录、视频等能力都可以按需装。

## 核心要点

1. **实时合并：像多人同时排队改同一张菜单**。每个浏览器发来的不是整篇文章，而是“从第几位开始插入/删除什么”的操作。服务器把这些操作按顺序合成一条历史，让所有人最终看到同一份文本。

2. **作者归属和 timeslider：像给每一笔字迹贴上姓名和时间**。Etherpad 默认用作者颜色标出是谁写的，历史滑杆能逐步回看整篇 pad 的演化。这让它特别适合会议纪要、公开草案和需要追溯编辑过程的场景。

3. **轻核心 + 插件：像先给你一间空会议室，再按需要搬投影仪和白板**。README 里的基础功能很克制，但插件可以补标题、评论、Markdown、OIDC 登录、访客权限和 WebRTC。代价是部署者要知道哪些能力来自核心、哪些来自插件。

## 实践案例

### 案例 1：本机跑一个临时协作 pad

官方 README 给的快速路径是安装依赖、启动生产模式，再用浏览器访问默认端口。

```bash
git clone -b master https://github.com/ether/etherpad.git etherpad-lite
cd etherpad-lite
pnpm i
pnpm run build:etherpad
pnpm run prod
```

逐部分解释：

- `git clone -b master`：拿到官方主线代码；仓库已经从旧名跳转到 `ether/etherpad`。
- `pnpm i`：安装 Node.js 依赖；当前 README 要求较新的 Node.js 版本。
- `pnpm run build:etherpad`：构建前端资源，否则生产模式缺少可服务的静态包。
- `pnpm run prod`：启动服务；浏览器打开 `localhost:9001` 就能创建 pad。

这个案例适合试用、课堂演示、临时 workshop。它不等于生产部署，因为默认数据库和默认密码策略还没认真配置。

### 案例 2：用 Docker Compose 加 PostgreSQL 部署

README 和 Docker 文档都给出 Compose 方向：应用容器负责编辑服务，PostgreSQL 容器负责持久化。

```yaml
services:
  app:
    image: etherpad/etherpad:latest
    ports:
      - "9001:9001"
    environment:
      DB_TYPE: "postgres"
      DB_HOST: postgres
      DB_NAME: etherpad
      DB_USER: admin
      DB_PASS: admin
      ADMIN_PASSWORD: admin
      DEFAULT_PAD_TEXT: " "
    depends_on:
      - postgres
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: etherpad
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: admin
```

逐部分解释：

- `image: etherpad/etherpad:latest`：使用官方镜像；文档也提到 GHCR 镜像可避开 Docker Hub 匿名拉取限制。
- `DB_TYPE: "postgres"`：把数据从测试用存储迁到专门数据库；生产环境不要依赖临时存储。
- `DEFAULT_PAD_TEXT: " "`：README 示例特别提醒这个值不要留空，否则新版本里可能变成必填项。
- `ADMIN_PASSWORD`：启用 `/admin`，后续才能在网页里管理插件和设置。

这个案例的重点是“状态在哪里”。pad 内容、作者、修订历史都必须进数据库和持久化卷，否则容器重建时就像把会议室白板擦掉。

### 案例 3：用 HTTP API 让业务系统创建 pad

关键：`groupMapper` 只是业务键，返回的 `data.groupID`（形如 `g.xxx`）才是真 ID；group pad 的 `padID` 必须是 `groupID$padName`，且要先 `createGroupPad`。

```bash
API=http://pad.example.com/api/1
H="Authorization: Bearer $ETHERPAD_TOKEN"

curl -sS -H "$H" "$API/createAuthorIfNotExistsFor?name=Michael&authorMapper=7"
GROUP_ID=$(curl -sS -H "$H" "$API/createGroupIfNotExistsFor?groupMapper=course-101" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['groupID'])")
curl -sS -H "$H" --get "$API/createGroupPad" \
  --data-urlencode "groupID=$GROUP_ID" --data-urlencode "padName=week-01" \
  --data-urlencode "text=第一周讨论提纲"
PAD_ID="${GROUP_ID}"'$week-01'
curl -sS -H "$H" --get "$API/setText" \
  --data-urlencode "padID=$PAD_ID" --data-urlencode "text=提纲（已更新）"
```

- `createGroupIfNotExistsFor` → 取出 `groupID`，不要把 `course-101` 当 pad 前缀。
- `createGroupPad` 之后才能稳定用 `groupID$padName` 读写；长文本用 POST/`--data-urlencode`。
- Bearer token 放服务端，不要写进前端。

业务系统管登录权限，Etherpad 只管实时编辑——适合嵌进教学平台或内部门户。

## 踩过的坑

1. **把测试数据库当生产数据库**：README 明确提醒生产环境要用专门数据库；临时存储只适合开发和试跑。

2. **以为 Docker 环境变量会改写文件**：Docker 文档和 issue #7819 背后的问题都指向同一件事，`settings.json` 是模板，环境变量在运行时解析，不会落回磁盘。

3. **反向代理没转发 WebSocket 升级头**：部署文档强调 Socket.IO 需要 `Upgrade` 和 `Connection` 头；少了它，实时编辑会退化或直接异常。

4. **用 GET 发送大段正文**：HTTP API 文档提醒 Node.js 对请求头大小有限制，大文本应使用 POST 和 `--data-urlencode`。

## 适用 vs 不适用场景

**适用**：

- 会议纪要、课堂共创、开放草案、事件记录，需要多人同时写且能回看历史。
- 组织希望自托管，自己决定数据库、备份、插件、账号和外部网络访问。
- 业务系统已有登录和权限，只缺一个能嵌入的实时编辑区域。
- 需要作者颜色、修订历史、导出和插件扩展，但不需要复杂排版。

**不适用**：

- 需要 Word/Google Docs 那种复杂版式、分页、批注流和办公套件集成。
- 主要写结构化富文本、组件化页面或图文混排，而不是线性文本。
- 团队没有人维护 Node.js 服务、数据库、反向代理和安全更新。
- 多副本高可用还没准备好会话亲和、共享状态和运维监控。

## 历史小故事（可跳过）

- **2008**：AppJet 发布 Etherpad，浏览器里真正实时的多人文本编辑迅速走红。
- **2009.12**：Google 收购 AppJet；在社区压力下开源原版代码（Java/Scala），随后官方托管服务关闭。
- **2011–2012**：社区用 Node.js 重写为更轻的 **etherpad-lite**，成为今天主线的前身。
- **长期演进**：仓库从 `etherpad-lite` 名称逐渐过渡到 `ether/etherpad`，但生态里很多包名和路径仍保留旧名字。
- **现在**：由小型志愿团队维护；GitHub 约 18k stars，README 提到 105 种语言、数百 `ep_` 插件和大量自托管实例。

## 学到什么

1. **协作编辑不是“保存快一点”**：真正难点是把并发输入变成一致历史，并让每个浏览器都追上同一个版本。
2. **自托管的意义是治理权**：谁能读、数据放哪、能否导出、是否接入 AI 或外部服务，都由部署者决定。
3. **轻核心要配合插件心智**：不要期待基础安装什么都有；先确认功能来自核心、插件还是反向代理。
4. **部署细节会直接影响产品体验**：WebSocket、数据库、环境变量、API 鉴权这些不是运维杂事，而是实时编辑能否稳定工作的地基。

## 延伸阅读

- 官方仓库：[ether/etherpad](https://github.com/ether/etherpad)
- Docker 文档：[doc/docker.md](https://github.com/ether/etherpad/blob/develop/doc/docker.md)
- HTTP API 文档：[doc/api/http_api.md](https://github.com/ether/etherpad/blob/develop/doc/api/http_api.md)
- Easysync 说明：[easysync-full-description.pdf](https://github.com/ether/etherpad/raw/master/doc/easysync/easysync-full-description.pdf)
- 插件文档：[doc/plugins.md](https://github.com/ether/etherpad/blob/develop/doc/plugins.md)
- [[hedgedoc]] —— 另一个面向协作写作的开源编辑器，重点在 Markdown。

## 关联

- [[socket-io]] —— Etherpad 的实时连接层围绕浏览器长连接和事件广播展开。
- [[hedgedoc]] —— 同样是多人协作写作工具，但文档模型和使用入口偏 Markdown。
- [[yjs]] —— 现代 CRDT 协作方案，可和 Etherpad 的 OT/changeset 思路对照。
- [[automerge]] —— 另一类本地优先协作数据结构，适合比较“服务器排队”和“副本合并”。
- [[prosemirror]] —— 富文本编辑器框架，帮助理解结构化文档与线性文本的差别。
- [[codemirror]] —— 浏览器文本编辑基础设施，常见于在线编辑器产品。
- [[nginx]] —— 生产部署中常作为反向代理，WebSocket 转发配置会影响实时编辑。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
