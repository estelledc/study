---
title: Defold — King 出品 Lua 引擎，移动优先 + 一键跨平台打包
来源: 'https://github.com/defold/defold'
日期: 2026-06-06
分类_原始: 工具
子分类: 渲染与图形
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

Defold 是一个**移动优先、all-in-one 的 2D/3D 跨平台游戏引擎**，用 Lua（确切说是 LuaJIT）写游戏逻辑，C++ 做高性能核心运行时。日常类比：像 Xcode 和 Unity 的混合体——下载一个编辑器，里面自带了视觉编辑器、代码编辑器、性能分析器、打包工具，不用额外配工具链就能把游戏发布到 iOS、Android、HTML5、Steam、Switch、PS5。

最简单的游戏对象脚本长这样：

```lua
-- player.script
function init(self)
    self.speed = 200
    msg.post(".", "acquire_input_focus")
end

function update(self, dt)
    -- dt = 这帧耗时（秒），保证帧率无关的移动速度
end

function on_input(self, action_id, action)
    if action_id == hash("touch") and action.pressed then
        local dir = vmath.vector3(action.x, action.y, 0)
        go.set_position(go.get_position() + dir * self.speed * 0.016)
    end
end
```

四个回调：`init`（初始化）、`update`（每帧）、`on_message`（收消息）、`on_input`（处理输入）——这是 Defold 脚本系统的全部心智模型。

**来历**：Defold 2014 年被 King（Candy Crush 母公司）收购后用于内部研发，2016 年对外免费开放，2020 年 5 月完整开源并移交给独立非营利组织 **Defold Foundation** 运营。GitHub 目前约 **5900 Stars**，每月发一个正式版本，最新是 1.12.4（2026 年 5 月）。

## 为什么重要

不理解 Defold 这类引擎，以下几件事看起来会很奇怪：

- 为什么同样是"2D 手游引擎"，Unity 的 Hello World 项目打包出来有 30 MB，而 Defold 只有 **~1 MB**——引擎体积在 H5 和移动端是硬指标
- 为什么 King 放弃一个已在生产跑了多年的引擎并"捐给"基金会——内部引擎面向商业决策优化，维护成本随业务变动起伏；独立基金会模式才能保证技术连续性
- 为什么手游行业的"免费+无版税"比 Unity 事件（2023 年宣布按装机收费）更具吸引力——Defold Foundation 明文禁止对引擎本身商业化，收入来自企业合作和捐款
- 为什么 Poki、Fingersoft（Hill Climb Racing）、MoonActive（Family Island）这些超休闲和重度运营游戏公司选择 Defold，而不是更主流的 Cocos 或 Unity——极小体积 + H5 优化 + 确定性许可证

## 核心要点

### 架构三件套：Collection → Game Object → Component

Defold 用三层嵌套结构组织游戏：

```
Collection（关卡/场景）
  └─ Game Object（游戏对象，有 position/rotation/scale）
       └─ Component（功能组件：Sprite / Script / Sound / CollisionObject…）
```

类比：Collection 是文件夹，Game Object 是文件，Component 是文件的内容。一个 Game Object 可以有多个 Component，所有逻辑从属于 Component（不是 Game Object 本身）。这比 Unity 的 GameObject+MonoBehaviour 模式更严格地把"位置/状态"和"行为"分离。

### 消息传递：msg.post()

Defold 对象之间**不直接调用方法**，而是通过消息总线通信：

```lua
-- 向 "/player#health" 组件发送 "take_damage" 消息
msg.post("/player#health", "take_damage", { amount = 10 })

-- 接收端
function on_message(self, message_id, message, sender)
    if message_id == hash("take_damage") then
        self.hp = self.hp - message.amount
    end
end
```

`hash()` 把字符串预编译成整数 ID，减少运行时字符串比较开销——这是 Defold 所有热路径的惯用写法。消息传递的代价是**异步 + 有延迟**（消息在帧末才分发），好处是彻底解耦，调试时可以追踪每条消息的发送者。

### LuaJIT 脚本层

Defold 用 LuaJIT（兼容 Lua 5.1）做脚本，而不是用更新的 Lua 5.4。原因是 iOS/Nintendo Switch 不允许 JIT 编译，需要在 LuaJIT 的解释模式回退；LuaJIT 的解释模式仍比标准 Lua 5.4 快，且 API 更稳定。

Lua 在 Defold 里的几个规则：
- `self` 是当前组件实例，可以存任意状态；每个组件实例独立
- 全局变量默认共享整个 Lua context（除非开启 `shared_state = 0` 隔离）
- `hash()` 永远应该在 `init()` 里预算好，别在 `update()` 里反复调用
- Defold 内置 `vmath`（向量/矩阵/四元数）、`go`（游戏对象操作）、`msg`、`timer`、`physics` 等命名空间

### 原生扩展机制

当 Lua 性能不足，Defold 允许用 C/C++ 写**原生扩展（Native Extension）**，通过标准 `.ext` 目录结构上传到云端 build server，自动编译进引擎——开发者不需要本地配置 NDK/Xcode 工具链就能生产出包含 C++ 扩展的 app：

```
myextension/
├── ext.manifest
├── src/
│   └── myextension.cpp   ← Lua C API 胶水层
└── include/
```

这和 Unity 的 Plugins 体系类似，但 Defold 把"上传→云端编译→下载带扩展的引擎"做成了一个透明的 CI 步骤，开发者感知不到工具链切换。

### 渲染管线

Defold 使用**可编程渲染管线**，默认渲染脚本（`default.render_script`）用 Lua 写，可以完整替换：

```lua
-- render_script 里直接控制渲染顺序
function update(self)
    render.set_view(self.view)
    render.set_projection(self.proj)

    render.enable_state(render.STATE_BLEND)
    render.draw(self.tile_pred)   -- 先画 tile
    render.draw(self.model_pred)  -- 再画 3D model
    render.draw(self.gui_pred)    -- 最后 GUI
end
```

底层是 OpenGL ES 2.0/3.0 兼容的 GLSL shader，每个 Material 绑定自己的 vertex/fragment shader。这比 Unity 的 URP/HDRP 更轻，但需要自己处理阴影、后处理等效果。

## 实践案例

### 案例 1：工厂模式动态生成子弹

```lua
-- gun.script
function init(self)
    self.bullet_factory = msg.url("#factory")  -- CollectionFactory 组件
    self.fire_rate = 0.2
    self.fire_timer = 0
end

function update(self, dt)
    self.fire_timer = self.fire_timer - dt
    if self.fire_timer <= 0 then
        self.fire_timer = self.fire_rate
        -- 在当前位置生成一颗子弹
        local pos = go.get_position()
        collectionfactory.create(self.bullet_factory, pos)
    end
end
```

`collectionfactory.create()` 从 prototype 克隆一个完整 Collection（含子弹的 sprite + collisionobject + script），返回游戏对象 ID。销毁时调 `go.delete(id)`——这是 Defold 的标准"对象池"前置写法，后续优化只需把 `create`/`delete` 换成池实现。

### 案例 2：Live Update（分包热更新）

Defold 原生支持 Live Update，把资源包（Liveupdate 资源组）放在云端 CDN，应用启动后按需下载：

```lua
-- 检查并下载额外关卡包
liveupdate.get_current_manifest(function(self, status, manifest_reference)
    resource.get_current_manifest(function(self, manifest_reference)
        local exclusions = resource.get_resource_list(manifest_reference, "level_pack_2")
        if #exclusions > 0 then
            -- 有待下载资源，弹出下载 UI
            msg.post("/ui#download", "show_download_prompt")
        end
    end)
end)
```

这是 H5 和移动游戏的核心需求：首包极小（1-2 MB）、核心关卡内嵌、扩展内容按需下载——Unity 的 Addressables 解决同一问题但配置复杂得多。

### 案例 3：在 HTML5/Poki 发布

Defold 对 HTML5 的支持不是"能跑就行"，而是有专门优化：

- 引擎 wasm 体积 ~700 KB（gzip 后），远小于 Unity WebGL 的 5-20 MB
- Poki SDK 有官方 Defold 扩展，`poki.gameplayStart()` / `poki.commercialBreak()` 两行接入广告
- HTML5 构建用 Emscripten，Lua 在浏览器里以解释模式运行（无 JIT）

```lua
-- 接入 Poki SDK
function init(self)
    poki.init(function(self)
        -- SDK 初始化完成，可以调用广告 API
    end)
end

function on_message(self, message_id, message)
    if message_id == hash("game_over") then
        poki.gameplayStop()
        poki.commercialBreak(function(self)
            -- 广告播完，重新开始游戏
            msg.post("/game", "restart")
        end)
    end
end
```

## 踩过的坑

1. **消息延迟导致的 bug**：`msg.post()` 的消息在当前帧末才分发，同一帧内发消息然后期望对方立即响应会静默失败。调试技巧：在 `on_message` 里加 `print(sender)` 追踪来源。

2. **iOS 上 JIT 不可用**：LuaJIT 在 iOS 只能以解释模式运行（苹果不允许可执行内存动态写入）。如果代码依赖 LuaJIT 的 FFI 库（直接调 C 函数），iOS 构建会崩溃——确认只用 Lua 5.1 标准 API 和 Defold 内置库。

3. **`hash()` 放错地方**：`hash("some_string")` 有字符串哈希计算开销，在 `update()` 里每帧调用会产生垃圾回收压力。正确做法是在 `init()` 里 `self.my_id = hash("some_string")` 缓存。

4. **全局变量的 Lua context 陷阱**：默认 `shared_state = 1`，所有脚本共享一个 Lua context，一个脚本里写的全局变量对所有脚本可见。这在 Unity 背景的开发者眼里反直觉——**养成用 `self.xxx` 而非全局变量存状态的习惯**。

5. **资源热重载后状态不一致**：开发期 hot reload 只替换代码文件，`self` 上的运行时状态不重置。改了 `init()` 里的初始化逻辑后，要重启游戏对象才能看到效果，不能只保存脚本文件。

## 适用 vs 不适用场景

**适用**：

- H5 游戏（Poki、CrazyGames、Facebook Instant Games）——包体积决胜负
- 超休闲和休闲手游——移动优先，打包一键，License 无隐患
- 小型独立工作室——all-in-one，不需要 3D 美术资产管线
- 需要在 Lua 快速迭代逻辑同时又要 C++ 性能插件的混合团队

**不适用**：

- AAA 级别的 3D 写实渲染——没有 HDRP 级别的 PBR 管线，3D 适合风格化
- Unity 大型 3D 项目迁移——组件哲学不同，资产格式不通用
- 已深度依赖 Asset Store 插件的项目——Defold Asset Portal 生态比 Unity 小得多
- 需要 C# 代码的团队——Defold 只有 Lua + C/C++，没有托管语言

## 历史小故事（可跳过）

- **2012 年**：Defold 由 Ragnar Svensson 和 Christian Murray 在瑞典创立，两人都有 demoscene（Demo 场景，极限压缩机器码让计算机展示视觉特效的亚文化）背景，这直接解释了为什么 Defold 对引擎体积的执念几乎到强迫症程度。
- **2014 年**：King 收购 Defold，用于内部游戏研发。Pet Rescue Puzzle Saga 是 King 少数用 Defold 做的产品之一，大多数 King 头部游戏（Candy Crush 系列）用的是更早期的内部引擎。
- **2016 年**：King 宣布 Defold 对外免费，但源代码仍不开放。
- **2020 年 5 月 19 日**：King 宣布将 Defold 完整捐赠给 Defold Foundation，同日在 GitHub 开放全部源代码（引擎 C++ 核心 + Clojure 编辑器 + 构建服务器）。Defold 创始团队成员从 King 离职，全职为 Foundation 工作。
- **2023 年**：Unity 宣布"Runtime Fee"（按装机次数收费）引发开发者大规模逃离，Defold 注册用户数量明显增长——"免费、无版税、License 不会变"变成了强有力的市场优势。
- **2026 年**：每月稳定迭代，最新版本 1.12.4 加入了自由飞行相机、更小的 HTML5 构建等特性；Wavedash、8BitSkull 等公司成为企业合作伙伴。

## 学到什么

1. **all-in-one vs 模块化的权衡**：Unity/Godot 生态更开放，Defold 的"闭合"工具链换来了更低的配置摩擦——对小团队这往往值得
2. **LuaJIT 的平台限制是设计约束，不是 bug**：理解 iOS 不允许 JIT 这条硬约束，就理解了为什么 Defold 要维护两条执行路径（JIT + 解释）
3. **消息传递是架构哲学**：`msg.post()` 的异步+解耦设计和 ECS 的数据导向思路相通——对象不直接调对象，而是发出"我做了什么"再由接收者决定如何响应
4. **许可证和商业模式是开发工具的核心竞争力**：Defold 的增长很大程度来自 Unity 的"运行时费"事件——"永远免费+无版税"是一种产品承诺，不只是营销话术
5. **体积是一等公民**：在 H5 游戏场景，1 MB vs 20 MB 的首包大小直接影响加载完成率和留存——Defold demoscene 基因让它在这个战场天然占优

## 延伸阅读

- 官方网站：[defold.com](https://defold.com/)
- GitHub 源码：[defold/defold](https://github.com/defold/defold)
- Lua 脚本手册：[defold.com/manuals/lua](https://defold.com/manuals/lua/)
- 构建块（架构详解）：[defold.com/manuals/building-blocks](https://defold.com/manuals/building-blocks/)
- Asset Portal：[defold.com/assets](https://defold.com/assets/)
- Poki + Defold 最佳实践（2026-06）：[Best practices when building for the web](https://defold.com/2026/06/02/Best-practices-when-building-for-the-web/)

## 关联

- [[godot]] —— 另一个开源引擎，GDScript（Python 风格），3D 生态更完整
- [[cocos2d-x]] —— 同为移动优先 2D 引擎，C++ 核心，Lua/JS 脚本，侧重中国市场
- [[phaser]] —— HTML5 2D 框架，但不是 all-in-one，只有运行时库没有编辑器
- [[lua]] —— Defold 的脚本语言，了解 Lua 的垃圾回收、协程、元表对写高质量 Defold 代码至关重要
- [[lottie]] —— 动画文件格式，Defold 有社区扩展支持 Lottie 播放

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

