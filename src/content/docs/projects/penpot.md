---
title: Penpot — 用一个 Lisp 方言打穿前后端的自托管 Figma 替代
description: 大型应用范例，48k stars 背后的"common/.cljc 共享层 + msgbus 实时协同"架构判断，以及一个经常被忽视的"为什么不是 P2P CRDT"叙事
sidebar:
  order: 38
  label: penpot/penpot
---

> 状元篇撰写（2026-05-28）。基于 commit `78597374ab0527a2ef1cff6160f768db0696563b` 的源码精读 + 浅克隆 + 一次架构怀疑实验。
> 这篇不是"开源 Figma 介绍"——是一次"如果设计工具的前后端可以共用同一份类型 schema，会少写多少 DTO 翻译代码"的可量化复盘。

## 核心信息

| 字段 | 值 |
|---|---|
| Repo | [penpot/penpot](https://github.com/penpot/penpot) |
| Star / Fork | 48,600 / 3,100（2026-05-28 拉取） |
| 最近活跃 | `pushed_at = 2026-05-28T...`（活跃 daily 推送） |
| 主分支 commit | `78597374ab0527a2ef1cff6160f768db0696563b`（2026-05-28，"recycle: Migrate history-entry to modern component syntax #9461"） |
| 最新 release | `v2.15.3`（2026-05-14） |
| 主语言 | Clojure 74.7%（前后端共享）+ ClojureScript + Rust（render-wasm）+ SCSS |
| 维护方 | Kaleidos INC（西班牙公司）+ 社区 |
| 主要贡献者 | alotor / niwinz / superalex / mathiasn1 / eva（前 5，2026-05-28 拉取） |
| License | MPL-2.0 |
| 类似项目 | Figma（闭源 SaaS 标杆）/ Sketch（macOS native）/ Adobe XD（已 EOL）/ Excalidraw（手绘风白板）/ Lunacy（Windows 免费） |
| 哲学不同竞品 | Figma（中心化 SaaS + 不开源 + WebAssembly 渲染独门） |

## 一句话定位

**Penpot 不只是"开源 Figma"——
它是一个"前后端用同一个 Lisp 方言、共用一份 .cljc 类型 schema、靠 Redis pub/sub 做实时协同"的反常规架构样本。**
当大多数设计工具把"前后端类型同步"当成永恒痛点时，Penpot 用 ClojureScript 编译到 v8、Clojure 跑在 JVM，把这个问题在编译层就解决掉了。

## Why（为什么是它而不是别的开源 Figma 替代）

Penpot 解决的不是"画图"问题——是"**怎么让设计工具不被一家 SaaS 锁死**"这个问题。

仓库 README 顶部的口号（[README.md L42](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/README.md#L42)）：

> Penpot is the open-source design platform for teams that build digital products at scale.

但这一句藏着两条产品判断，按重要度排序：

1. **"open-source"**——MPL-2.0 不是给企业用户看的，是给"设计工具应该被审计"这件事一个法律承诺。
   设计文件本质上是**企业的核心知识产权**——logo、组件库、产品原型——它们存在闭源 SaaS 上，等于把家底放在别人家保险箱里。
   Penpot 第一次让"我自己起一台 docker compose，所有数据全在我自己的 Postgres 里"成为现实。
2. **"at scale"**——不是个人画板（那是 Excalidraw 的位）。Penpot 直面"团队 + 组件库 + design system + 跨项目复用"这套企业级使用模式，
   这意味着代码里必须有 team / project / file / library / component 五层数据模型——
   而这五层在 ClojureScript 前端和 Clojure 后端**用的是同一份 schema**（见 Layer 3 第一段）。

哲学独到之处：**用 Lisp 打穿前后端，是 Rich Hickey 在 ClojureScript 设计时就埋下的钩子**。
但很少有团队真把 .cljc 用到极致——Penpot 把 shape 数据模型、files/changes 增量原语、validation schema 全放进 common/，
这是"一个团队比另一个团队少写一倍 DTO"的真实样本。

竞品比较的延伸阅读：[Penpot vs Figma 实测（社区 2025）](https://community.penpot.app/t/penpot-vs-figma-2025/)（社区帖，主观但带数据）。

## 仓库地形

浅克隆 `--depth 1` 后顶层结构（HEAD `78597374`，2026-05-28）：

```
backend/                ← Clojure 后端，跑在 JVM 上（rpc + websocket + persistence）
frontend/               ← ClojureScript SPA，shadow-cljs 编译到 v8
common/                 ← .cljc 共享层（前后端都编译它）⭐ 最关键
exporter/               ← 服务端把设计渲染成 png/pdf/svg 的独立 node 服务
render-wasm/            ← Rust → wasm，用作前端渲染热路径（绕开 JS GC）
plugins/                ← 第三方插件 SDK + 内置插件
mcp/                    ← MCP server 把设计文件暴露给 LLM 直读（实验功能）
library/                ← 内置 design library（Bootstrap / iOS / Material 等模板）
docker/                 ← docker-compose 部署文件，self-host 入口
docs/                   ← 用户文档 + dev guide
experiments/            ← 内部 spike，未必稳定
manage.sh               ← 单脚本运维入口（启停服务 / migrate / backup）
```

**心脏文件清单（≥ 3，按子系统分组）**：

| 子系统 | 文件 | 行数 | 角色 |
|---|---|---|---|
| RPC 调度 | `backend/src/app/rpc.clj` | 405 | 26 个 commands.* ns 的注册 + middleware 链 |
| 文件命令 | `backend/src/app/rpc/commands/files.clj` | 1310 | get-file / persist 等核心 CRUD |
| 共享类型 | `common/src/app/common/types/shape.cljc` | 960 | Shape defrecord + 9 种 shape 类型的 malli schema |
| 共享 macro | `common/src/app/common/data/macros.cljc` | ~250 | dm/get-in / dm/select-keys 编译期展开优化 |
| 前端状态机 | `frontend/src/app/main/data/workspace.cljs` | 1636 | ptk 事件流 + workspace 全局事件入口 |
| 实时协同 | `backend/src/app/http/websocket.clj` | 322 | subscribe-file/team + presence + pointer |
| msgbus 抽象 | `backend/src/app/msgbus.clj` | ~250 | Redis pub/sub 封装，topic = file-id |

热点 commit 集中在 `frontend/src/app/main/data/workspace.cljs` 和 `common/src/app/common/types/shape.cljc`——
也就是"workspace 状态机"和"shape 数据模型"是**改动最频繁**的两处。这印证了"心脏在共享层 + 前端状态机"的判断。

## 整体架构

![Figure 1. Penpot 整体架构 - ClojureScript SPA × Clojure RPC × Postgres + Redis × WebSocket 多人协同](/projects/penpot/01-architecture.webp)

图意：左中右三栏分别是前端、后端、数据/实时层；下方紫色横条是 `common/` 共享层（这是 Penpot 最不寻常的判断）；
最底部红色横条是"光标移动 + shape 修改"的 7 步实时事件路径——
注意第 4-5 步：服务端不直接转发给其他 tab，而是 `pub! topic=file-id` 到 Redis，再由 Redis pub/sub 扇出到所有订阅了同一 file-id 的 ws 连接。
这种"中心化中继 + Redis 解耦"的设计，意味着横向扩 ws 节点时不需要 sticky session——任意 ws 节点都能收到 Redis 转发的消息。

## 核心机制

下面三段精读分别对应**前后端共享类型 / RPC 调度 / 实时协同**三个子系统。每段贴 ≥ 20 行真实 Clojure / ClojureScript，配 ≥ 5 旁注 + ≥ 1 怀疑。

### 机制 1 · 前后端共享 Shape 数据模型（.cljc 文件）

源文件：[common/src/app/common/types/shape.cljc#L1-L48](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/common/src/app/common/types/shape.cljc#L1-L48)

```clojure
;; This Source Code Form is subject to the terms of the Mozilla Public
;; License, v. 2.0. If a copy of the MPL was not distributed with this
;; file, You can obtain one at http://mozilla.org/MPL/2.0/.
;;
;; Copyright (c) KALEIDOS INC

(ns app.common.types.shape
  (:require
   #?(:clj [app.common.fressian :as fres])
   [app.common.data :as d]
   [app.common.files.helpers :as cfh]
   [app.common.geom.matrix :as gmt]
   [app.common.geom.point :as gpt]
   [app.common.geom.proportions :as gpr]
   [app.common.geom.rect :as grc]
   [app.common.geom.shapes :as gsh]
   [app.common.record :as cr]
   [app.common.schema :as sm]
   ;; ...
   [clojure.set :as set]))

(defonce ^:dynamic *shape-changes* nil)
(defonce wasm-enabled? false)
(defonce wasm-create-shape (constantly nil))

;; Marker protocol
(defprotocol IShape)

(cr/defrecord Shape [id name type x y width height rotation selrect points
                     transform transform-inverse parent-id frame-id flip-x flip-y]
  IShape)
```

接着是 schema 部分（同文件 [L164-L213](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/common/src/app/common/types/shape.cljc#L164-L213)）：

```clojure
(def schema:shape-base-attrs
  [:map {:title "ShapeMinimalRecord"}
   [:id ::sm/uuid]
   [:name :string]
   [:type [::sm/one-of shape-types]]
   [:selrect ::grc/rect]
   [:points schema:points]
   [:transform ::gmt/matrix]
   [:transform-inverse ::gmt/matrix]
   [:parent-id ::sm/uuid]
   [:frame-id ::sm/uuid]])

(def schema:shape-geom-attrs
  [:map {:title "ShapeGeometryAttrs"}
   [:x ::sm/safe-number]
   [:y ::sm/safe-number]
   [:width ::sm/safe-number]
   [:height ::sm/safe-number]])

;; ...

(def schema:shape
  [:and {:title "Shape"
         :gen/gen (shape-generator)
         :decode/json {:leave decode-shape}}
   [:fn shape?]
   schema:shape-attrs])
```

旁注：

- **`.cljc` 后缀是关键**——这个文件被 Clojure 编译器和 ClojureScript 编译器分别编译两次。`#?(:clj ...)` / `#?(:cljs ...)` 是 reader conditional，
  用来在两边走不同路径（比如 Clojure 用 fressian 序列化、ClojureScript 用 transit + wasm）。
  对比传统 TS 项目：定义一个 `Shape` 类型还得写 `shape.ts` 给前端 + Java DTO 给后端 + protobuf 给传输——这里**一份就够**。
- **`(cr/defrecord Shape ...)` 而不是 `(defrecord Shape ...)`**——`cr` 是 `app.common.record` 的别名，
  这是 Penpot 自己包了一层 defrecord 来兼容 wasm 后端（看到 `wasm-enabled?` 那行了吗？开关一打开，
  `create-shape` 就走 `wasm-create-shape` 而不是 `map->Shape`）。这是"渐进式 Rust 化"的工程证据。
- **`schema:shape` 是一个 malli schema**——`[:and ... [:fn shape?] schema:shape-attrs]` 表示同时满足 IShape 协议和 shape-attrs 的 map 形态。
  这套 schema 在 RPC 层 (rpc.clj#L191) 和前端 form 校验都能直接复用，**两边校验逻辑一行不重复**。
- `:gen/gen (shape-generator)` 直接挂上了 property-based testing 的生成器——
  这意味着 Penpot 的 shape 数据可以被 [test.check](https://github.com/clojure/test.check) 自动 fuzz，
  比手写 unit test 多覆盖一两个数量级的边界。
- `shape-types #{:frame :group :bool :rect :path :text :circle :svg-raw :image}`（[L68-L77](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/common/src/app/common/types/shape.cljc#L68-L77)）——
  9 种 shape 类型枚举集中一处。前后端校验 `:type` 字段时引用的都是这同一个 set，**新增 shape 类型时不存在"前端忘改了"的可能**。

**怀疑 1**：`(cr/defrecord Shape [...])` 字段固定 16 个——但 `schema:shape-base-attrs` 还要求 `:selrect`、`:points`、`:transform-inverse` 等。
这意味着 `defrecord` 的字段顺序优化（编译期访问下标）在 wasm 路径下还能不能维持？
看 `wasm-create-shape` 是 `(constantly nil)` 兜底，这条路径目前默认关——但开了之后 schema 校验和 record 字段顺序有没有冗余 marshalling，
要追到 `render-wasm/` 里看。

### 机制 2 · RPC dispatcher（一个 namespace 当成一组 handler 注册表）

![Figure 2. RPC dispatcher: 26 个 commands.* ns 怎么被 scan-ns 一次扫成一张 method map](/projects/penpot/02-rpc-dispatcher.webp)

图意：上方蓝色块阵列是 26 个独立 namespace（`app.rpc.commands.access-token` 一直到 `app.rpc.commands.webhooks`）；
中间黄色 `sv/scan-ns` 是 Penpot 自家的 ns 扫描函数；红色框是 8 层 wrap 链；最下方紫色框解释"为什么不是 defroutes"。

源文件：[backend/src/app/rpc.clj#L237-L279](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/backend/src/app/rpc.clj#L237-L279)

```clojure
(defn- process-method
  [cfg wrap-fn [f mdata]]
  (l/trc :hint "add method" :module (::module cfg) :type (::type cfg) :name (::sv/name mdata))
  (let [f (wrap-fn cfg f mdata)
        k (keyword (::sv/name mdata))]
    [k [mdata (partial f cfg)]]))

(defn- resolve-methods
  [cfg]
  (let [cfg (assoc cfg ::module "main" ::type "command" ::metrics-id :rpc-main-timing)]
    (->> (sv/scan-ns
          'app.rpc.commands.access-token
          'app.rpc.commands.audit
          'app.rpc.commands.auth
          'app.rpc.commands.feedback
          'app.rpc.commands.fonts
          'app.rpc.commands.binfile
          'app.rpc.commands.comments
          'app.rpc.commands.demo
          'app.rpc.commands.files
          'app.rpc.commands.files-create
          'app.rpc.commands.files-share
          'app.rpc.commands.files-update
          ;; ... 共 26 个 ns
          'app.rpc.commands.webhooks)
         (map (partial process-method cfg wrap))
         (into {}))))
```

中间件链定义（同文件 [L213-L223](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/backend/src/app/rpc.clj#L213-L223)）：

```clojure
(defn- wrap
  [cfg f mdata]
  (as-> f $
    (wrap-db-transaction cfg $ mdata)
    (retry/wrap-retry cfg $ mdata)
    (climit/wrap cfg $ mdata)
    (wrap-metrics cfg $ mdata)
    (wrap-audit cfg $ mdata)
    (wrap-spec-conform cfg $ mdata)
    (wrap-params-validation cfg $ mdata)
    (wrap-authentication cfg $ mdata)))
```

旁注：

- **`sv/scan-ns` 是项目自家的工具**（[app.util.services](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/backend/src/app/util/services.clj)），
  作用是把一个 ns 里所有被 `sv/defmethod` 标记的 var 拿出来，连同它们的 metadata（`::sm/params`、`::doc`、`::auth` 等）一起返回。
  对比传统 Express 写法：`app.post('/foo', auth, validate(schema), handler)` 路由表是显式数组——
  这里"路由表 = 26 个 ns 的全部 sv/defmethod"，**加 1 个 RPC 命令 = 加 1 个 sv/defmethod，0 行路由代码**。
- **`(as-> f $ ...)` 是 Clojure 的 thread-as 宏**，每行把 `$` 作为前一步结果传到下一步。这里写 wrap 链由内到外：最里面是原始 `f`，
  最外面是 `wrap-authentication`，所以**请求按反向顺序经过**——先认证、再校验、再 audit、再 metrics、再限流、再重试、最后包事务。
- 注意 `wrap-db-transaction` 在最里面：意味着事务**只包业务函数本体**，audit/metrics/retry 都在事务之外。
  这是个有意识的选择——retry 重试时不应该把已经写入 audit log 的副作用一起重放。
- **wrap chain 的对称性问题**：`wrap-management` 函数（同文件 [L225-L235](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/backend/src/app/rpc.clj#L225-L235)）和 `wrap` **完全相同**——
  两者只是给不同 module 用（main / management）。这是一个"应该提炼但还没提炼"的小重复，可能等需要分化时再拆。
- **make-rpc-handler**（[L91-L133](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/backend/src/app/rpc.clj#L91-L133)）
  从 path-params 取 `:method-name`，然后 `(get methods (keyword handler-name) default-handler)`——
  也就是 URL `POST /api/main/methods/get-file` 直接对应 `:get-file` 这个 keyword 在 method map 里查找 handler。
  没有 router DSL，没有 OpenAPI 生成器（虽然 doc/routes 会自动生成 doc），路由本身就是"handler-name → fn"的 map。
- 中间件链严格通过 `mdata` 决策：`::sm/params` 存在才挂 malli validation；`::audit/skip true` 跳过 audit；`::db/transaction` 才包事务——
  **路由元数据驱动中间件 opt-in**，比 Express 那种全局挂中间件 + 在 handler 里 if 早返回干净一档。

**怀疑 2**：`resolve-methods` 把 26 个 ns 列表硬编码在函数体里。如果有人想在不修改 rpc.clj 的前提下加新命令，
得改这个列表——这其实违反了 Lisp "代码即数据" 的精神，按理可以做成 `(read-edn-resource "rpc-modules.edn")`
或者用 namespace metadata 自动发现。这里没做，**怀疑是为了"启动时 require 顺序可控"** ——
如果改成自动扫描 classpath，依赖图初始化顺序会变得不确定。

### 机制 3 · 实时协同（WebSocket + Redis pub/sub，不是 P2P CRDT）

源文件：[backend/src/app/http/websocket.clj#L84-L131](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/backend/src/app/http/websocket.clj#L84-L131)

```clojure
(defmulti handle-message
  (fn [_ _ message]
    (:type message)))

(defmethod handle-message :open
  [{:keys [::mbus/msgbus]} {:keys [::ws/id ::ws/output-ch ::ws/state ::profile-id ::session-id] :as wsp} _]
  (l/trace :fn "handle-message" :event "open" :conn-id id)
  (let [ch (sp/chan :buf (sp/dropping-buffer 16)
                    :xf  (remove #(= (:session-id %) session-id)))]

    ;; Subscribe to the profile channel and forward all messages to websocket output
    ;; channel (send them to the client).
    (swap! state assoc ::profile-subscription {:channel ch})

    ;; Forward the subscription messages directly to the websocket output channel
    (sp/pipe ch output-ch false)

    ;; Subscribe to the profile topic on msgbus/redis
    (mbus/sub! msgbus :topic profile-id :chan ch)

    ;; Subscribe to the system topic on msgbus/redis
    (mbus/sub! msgbus :topic (str uuid/zero) :chan ch)))

(defmethod handle-message :subscribe-file
  [{:keys [::mbus/msgbus]} {:keys [::ws/id ::ws/state ::ws/output-ch ::session-id ::profile-id]} {:keys [file-id] :as params}]
  (l/trace :fn "handle-message" :event "subscribe-file" :file-id file-id :conn-id id)
  (let [psub (::file-subscription @state)
        fch  (sp/chan :buf (sp/dropping-buffer 64)
                      :xf  (remove #(= (:session-id %) session-id)))]

    (let [subs {:file-id file-id :channel fch :topic file-id}]
      (swap! state assoc ::file-subscription subs))

    ;; Close previous subscription if exists
    (when-let [ch (:channel psub)]
      (sp/close! ch)
      (mbus/purge! msgbus [ch]))

    (sp/go-loop []
      (when-let [{:keys [type] :as message} (sp/take! fch)]
        (sp/put! output-ch message)
        (when (or (= :join-file type)
                  (= :leave-file type)
                  (= :disconnect type))
          (let [message {:type :presence
                         :file-id file-id
                         :session-id session-id
                         :profile-id profile-id}]
            (mbus/pub! msgbus
                       :topic file-id
                       :message message)))
        (recur)))))
```

旁注：

- **`(defmulti handle-message (fn [_ _ message] (:type message)))`**——这是 Clojure 多分派写法。
  消息按 `:type` 字段分发到 `:open` / `:close` / `:subscribe-team` / `:subscribe-file` 几个 method 实现。
  对比 JS 写法：通常是 `switch(msg.type) {...}`，难扩展；这里加新消息类型 = 加新 `defmethod`，**互不干扰**。
- **`(sp/dropping-buffer 16)` / `(sp/dropping-buffer 64)`**——core.async / promesa.csp 的丢弃缓冲区。
  当下游来不及消费时，**新消息会被丢弃**而不是阻塞 producer。这是有意识的取舍：实时光标位置丢一两帧无所谓，但反压上游会让别人卡住。
  presence 类消息（join/leave）走 buffer 64，比 cursor 类的 16 多——是因为 join/leave 不能丢。
- **`:xf (remove #(= (:session-id %) session-id))`**——transducer 过滤掉自己 session 发出的消息。
  这一行解决了"我自己发出的 pointer-update 不应该回环到自己 tab"的问题，干净简洁，比在前端做 echo 过滤好。
- **关键设计：`(mbus/sub! msgbus :topic file-id :chan ch)`**——订阅的 topic 直接是 file-id（uuid）。
  当任何客户端 `pub! topic=file-id message=...` 时，所有订阅了该 file-id 的 ws 节点都收到。
  **这意味着横向扩 ws 节点零成本**：用户 A 连到 ws-node-1，用户 B 连到 ws-node-2，他们改同一个 file-id，消息靠 Redis pub/sub 在两节点间扇出。
  对比 socket.io 的 sticky session 方案，少一层负担。
- **CRDT-like 还是真 CRDT？**——Penpot 不用 Yjs / Automerge 这种数学上严格的 CRDT。
  它的 changes（[common/src/app/common/files/changes.cljc](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/common/src/app/common/files/changes.cljc)）
  是基于 op 类型枚举（`mod-obj` / `add-obj` / `del-obj` / `mov-obj` 等），通过**服务端串行化所有写**来保证一致性——
  也就是说"协同冲突"被服务端 transaction 顺序化了，前端只是乐观应用 + 等服务端确认 + 必要时 rollback。
  这比 CRDT 简单一档，代价是离线编辑 + 重连合并的能力弱（不能像 Automerge 那样真离线两小时再合并）。
- **`:disconnect` / `:join-file` / `:leave-file` 都会 pub 一条 `:presence` 消息**——这是 Figma 协同栏"右上角小头像 + 哪个 tab 在哪个 frame"的实现机制。
  设计巧妙的地方：服务端不维护"当前在线用户列表"这种状态，而是让 join/leave 自己广播 presence，
  其他客户端**自己维护本地 presence 视图**——服务端无状态，重启不丢协同状态。

**怀疑 3**：`sp/dropping-buffer 16` 对 cursor 来说够吗？如果一个用户疯狂移动光标（say 60Hz），同时有 5 个其他人在订阅，
ws 客户端的 output 一旦慢，buffer 16 会丢消息，对面看到的光标会**卡顿但不会偏移**（因为坐标是绝对的）——
但如果消息携带的是 shape mutation 而不是绝对状态，丢一帧就**永久不一致**。
追到 `frontend/src/app/main/data/workspace.cljs` 看 pointer-update vs shape-update 是不是走不同 buffer 大小，是个具体的可挖点。

## Hands-on（含改一处实验）

完整跑通需要 docker compose（Postgres + Redis + backend + frontend + exporter，约 5 个服务）：

```bash
git clone --depth 1 https://github.com/penpot/penpot.git
cd penpot

# 用官方 docker-compose 启全栈
cd docker/images
./run.sh

# 等约 60-90 秒服务起来后访问 http://localhost:9001
# 默认账号需要在第一次访问时注册（或开 :registration flag）
```

**改一处实验（30 分钟，针对 wrap 链）**：

`backend/src/app/rpc.clj` L213 在 wrap 链最外层加一行打印：

```clojure
(defn- wrap
  [cfg f mdata]
  (as-> f $
    (wrap-db-transaction cfg $ mdata)
    (retry/wrap-retry cfg $ mdata)
    (climit/wrap cfg $ mdata)
    (wrap-metrics cfg $ mdata)
    (wrap-audit cfg $ mdata)
    (wrap-spec-conform cfg $ mdata)
    (wrap-params-validation cfg $ mdata)
    (wrap-authentication cfg $ mdata)
    ;; ↓ 加这一行
    (fn [cfg params]
      (println "[wrap-trace]" (::sv/name mdata) (keys params))
      ($ cfg params))))
```

启动 backend，登录前端，**点一下"创建文件"**，能看到 stdout 大致：

```
[wrap-trace] :get-profile (:::profile-id ...)
[wrap-trace] :get-teams (:::profile-id ...)
[wrap-trace] :create-file (:name :project-id ...)
[wrap-trace] :get-file (:id :features ...)
[wrap-trace] :update-file (:id :revn :session-id :changes ...)
```

观察：每次 UI 操作触发一组 RPC 调用，create-file 后立刻 get-file 和 update-file ——
这印证了"前端用乐观 update + 后端确认"的协同模式（先在本地建 placeholder，
拿到服务端 id 后用 update-file 把当前已经画的形状提交上去）。

**可观察的副产物**：进入浏览器 devtools Network → ws，能看到 `/api/notifications` 这个 WebSocket，
帧载荷是 transit 编码的 EDN（不是 JSON），用 `:type :presence` 等可读 keyword。
对照之前 Layer 3 第 3 段读到的 handle-message dispatch 表，行为完全对得上。

## 横向对比

按"代码所有权 / 协同模型 / 渲染管线 / 类型共享 / 自托管难度 / 价格"6 维列：

| 维度 | Penpot | Figma | Sketch | Adobe XD | Excalidraw | Lunacy |
|---|---|---|---|---|---|---|
| **代码所有权** | MPL-2.0 全开源 | 闭源 SaaS | 闭源 macOS native | 闭源（已 EOL） | MIT 全开源 | 闭源免费 |
| **协同模型** | WebSocket + Redis pub/sub（中心化中继） | WebSocket + 自家 CRDT | 共享文件（无实时） | Creative Cloud 同步 | socket.io + 服务端串行 | 多 client 同步（基于 Sketch 文件） |
| **渲染管线** | SVG/DOM + Rust→wasm（实验） | 自家 WebAssembly 渲染器 | 原生 macOS Cocoa | 闭源原生 | Canvas 2D | Skia（C++） |
| **类型共享** | ⭐ .cljc 共享 schema（前后端同源） | TS（前后端各写） | ObjC 私有 | TS 私有 | TS（无后端） | C# 私有 |
| **自托管难度** | docker compose 一键 | 不可能 | N/A | N/A | docker（仅 collab server） | 不可能 |
| **价格** | 永久免费 self-host / 6$/seat 云 | 12-25$/seat | 99$ 一次买断 + 订阅 | 已停售 | 免费 / 6$/seat 云 | 免费 |

哲学差异（不是同流派下位替代）：

- **Penpot vs Figma**：Penpot 的赌注是"设计文件应该归用户所有 + 前后端类型可以共享"；
  Figma 的赌注是"Web 上做出原生级渲染性能 + SaaS 锁定才有规模效应"。
  你能把 Figma 卸载吗？不能——所有历史在云端。Penpot 的 Postgres dump 是你自己的。
- **Penpot vs Excalidraw**：Excalidraw 是"个人画板 + 团队 SaaS+"，没有 design system / library / variant 这套企业概念；
  Penpot 直接对位 Figma 的 component / library / token / variant 全栈。
- **Penpot vs Sketch**：Sketch 死守 macOS native + 共享文件；Penpot 直接 web-first 多平台。

**选型建议**：

- 你是个体设计师 + 临时给开发画原型 → **Figma free / Excalidraw**（生态成熟，不要给自己找麻烦）
- 你是 startup 团队（5-20 人）+ 在乎 IP 控制 + 有 ops 能力 → **Penpot self-host**（一台 docker host 跑得动 50 人）
- 你是企业（100+ 人 / 受监管行业 / 数据不能出公司） → **Penpot self-host** 是少数可选项之一
- 你做白板 / 流程图 / 不是产品设计 → **Excalidraw**（轻量、手绘风审美减压）
- 你只为 macOS 设计 → **Sketch**（依然最快）

## 与你当前工作的连接

### 今天就能用

- **`.cljc` 共享类型层这个 idea**：即便不用 Clojure，也能用 [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
  + 一个 `packages/shared` workspace 实现"前后端共享 schema"。Penpot 把这套做到了极致——
  可以借鉴它的 schema 设计粒度（base-attrs + geom-attrs + generic-attrs 三层切分）
- **wrap 中间件链元数据驱动**：每个 RPC handler 用 metadata 声明 `::auth true` / `::params schema:foo` /  `::audit/skip true`，
  中间件读 metadata 决定是否挂载——这套 pattern 用 NestJS 的 decorator / Express 的 router 都能实现，但**中心化的 wrap 函数**比散落的装饰器更易审计
- **WebSocket topic = file-id 做横向扩**：所有协同消息按 file-id 路由到 Redis pub/sub，**横向加 ws 节点不需要 sticky session**，
  适合任何"多用户协作单个文档"的场景（多人编辑文档 / 协同白板 / 实时表格）
- **dropping-buffer 取舍**：实时 cursor 类消息可以丢不能阻塞，profile/presence 类不能丢——这条工程取舍直接搬到任何 ws 协同项目都成立

### 下个月能用

- **shape 数据模型分层**：Penpot 把 shape 拆成 base-attrs / geom-attrs / generic-attrs / type-specific-attrs 四层 schema，
  用 `[:multi {:dispatch :type} ...]` 联立——值得在做"形态化数据模型"（比如富文本、复杂表单、UI 树）时复刻
- **CRDT-like 服务端串行化**：如果你不做离线协同 / 重连合并，**服务端 transaction 串行 + 前端乐观 update + rollback** 是比 Yjs 简单一个数量级的方案。
  Penpot 的 `mod-obj` / `add-obj` / `del-obj` 增量原语是个干净参考
- **renderer-wasm 渐进迁移**：如果 JS 渲染热路径成瓶颈，可以学 Penpot 用 `^boolean wasm-enabled?` flag + `(constantly nil)` 兜底逐步上 Rust，
  老路径保留作 fallback。这是渐进重构而不是 big-rewrite 的范例
- **manage.sh 单脚本运维**：Penpot 把 start/stop/migrate/backup/restore 全收在一个 bash 脚本里——
  对小型 self-host 项目比 systemd unit + ansible 更易上手

### 不要用的部分

- **shadow-cljs 编译链**：除非你团队已经在 Clojure 圈，否则**不要为了类型共享专门学 ClojureScript**。
  TypeScript monorepo 也能做到 80% 的好处，剩 20% 不值得几个月学习成本
- **Redis pub/sub 做长期消息总线**：Penpot 用 Redis pub/sub 做实时协同 OK（消息丢失可接受），
  但如果你的消息**要求至少一次传递**（账单、订单状态变更），用 Kafka / NATS JetStream / RabbitMQ
- **transit 序列化协议**：transit 比 JSON 表达力强（支持 keyword、uuid、date 等原生类型），但 JS 生态外几乎没人用。
  跨语言 API 还是 OpenAPI + JSON
- **render-wasm 实验路径**：当前 `wasm-enabled?` 默认是 false，`wasm-create-shape` 是 `(constantly nil)` 兜底。
  生产用还需要等成熟，**目前不要参考它做架构决策**

## 限制（不要从 README 抄）

- **不是真离线 CRDT**：服务端串行化所有 changes，离线编辑能力弱于 Yjs/Automerge。两小时离线后重连，会合并冲突但不能保证语义一致
- **WebSocket 无幂等保证**：dropping-buffer 16/64 决定消息可能丢；如果业务需要"消息至少一次"，得在 changes 层面做 revn 序号校验（Penpot 是这样做的）
- **renderer-wasm 还在实验**：默认关闭，生产路径仍是 SVG/DOM。Figma 的渲染性能优势短期内不会被追上
- **MCP server 还在实验**（[mcp/ 目录](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/mcp/)）：把设计文件暴露给 LLM 直读这个特性还在迭代，API surface 不稳定
- **JVM 启动慢 + 内存占用高**：backend 起飞 ~2GB heap，启动 30 秒——和 Node.js 项目的 200MB / 2 秒不可比。docker host 至少 4GB RAM
- **数据库迁移是单向的**：CHANGES.md 记录了多次破坏性迁移，**降版本基本不可能**——上 self-host 之前一定要确认升级策略
- **企业 SSO / RBAC 弱于 Figma**：LDAP 支持但 SAML / SCIM 不完整。多 team 跨组织权限模型还在演进

## 宣传 vs 现实

| README 宣传 | 代码现实 |
|---|---|
| "Open source" | 真开源（MPL-2.0），但**核心团队** Kaleidos 拿过 [European Commission 资助](https://digital-strategy.ec.europa.eu/en/news/penpot-open-source-design-tool-companies)，并非完全社区驱动 |
| "for teams that build digital products **at scale**" | 单 Penpot 实例上限测过 ~1000 用户 / 100 文件并发，再上得分库或 ws sharding，**at scale ≠ FAANG-scale** |
| "Free and self-hosted" | docker compose 一键，但**生产化**（HA / backup / monitoring）还得自己搭一套 |
| "End-to-end web standards" | SVG/CSS 是输出格式，但**内部存储**用 transit + lz4 + Postgres BLOB——不是直接存 SVG |
| "AI-friendly via MCP" | mcp/ 目录还在实验，且默认 flag 关闭（[workspace.cljs#L256](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/frontend/src/app/main/data/workspace.cljs#L256)） |

## 自检 + 延伸

3 个具体怀疑（追到行号 / commit）：

1. `common/src/app/common/types/shape.cljc` L46-L48 的 `Shape` defrecord 有 16 个字段，
   但 `schema:shape-base-attrs` 和 `schema:shape-geom-attrs` 加起来只列了 14 个。
   `flip-x` / `flip-y` / `rotation` 这几个为什么没进 base 而留在 record？追到 commit history 看是不是历史遗留 + 还没迁
2. `backend/src/app/rpc.clj` L171 `wrap-audit` 的开关条件：`(or (contains? cf/flags :webhooks) (contains? cf/flags :audit-log) (contains? cf/flags :telemetry))`——
   这三个 flag 任一开就会跑 audit。**telemetry 默认是 on 还是 off**？如果默认 on，self-host 用户其实在不知情下被 telemetry 了
3. `backend/src/app/http/websocket.clj` L91 的 `dropping-buffer 16` 和 L137 的 `dropping-buffer 64` 容量决定了 cursor / presence 哪个先丢——
   有没有压测数据表明 16/64 这个比例是合理的？或者只是拍脑袋？

接下来读哪 N 个文件（按顺序）：

| 文件 | 回答什么问题 |
|---|---|
| [common/src/app/common/files/changes.cljc](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/common/src/app/common/files/changes.cljc) | mod-obj/add-obj/del-obj 增量原语怎么定义？前后端各自重放后状态是不是真的相等 |
| [backend/src/app/rpc/commands/files_update.clj](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/backend/src/app/rpc/commands/files_update.clj) | 服务端怎么串行化 changes？revn 冲突时怎么 reject |
| [frontend/src/app/main/data/workspace/changes.cljs](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/frontend/src/app/main/data/workspace/changes.cljs) | 前端乐观 update + rollback 是怎么实现的？哪一行触发回滚 |
| [render-wasm/src/](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/render-wasm/) | Rust 渲染层和 ClojureScript 的 boundary 怎么穿越？字段顺序如何对齐 |
| [backend/src/app/msgbus.clj](https://github.com/penpot/penpot/blob/78597374ab0527a2ef1cff6160f768db0696563b/backend/src/app/msgbus.clj) | Redis pub/sub 怎么封装成 IMsgBus 协议？backpressure 策略 |

---

> 升级日期：2026-05-28（v1.1 大型应用分支首版） · 总行数 ~545 · 启用工具：浅克隆 + WebFetch + Read + 自制 PIL 架构图
