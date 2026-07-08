---
title: Defold — King 出品的 Lua 跨平台游戏引擎
来源: 'https://github.com/defold/defold'
日期: 2026-07-08
分类: graphics
难度: 初级
---

## 是什么

Defold 是一个用 Lua 写游戏逻辑、用编辑器拼场景、再一键打到桌面、手机和 Web 的轻量游戏引擎。日常类比：像一个已经搭好厨房、冰箱和外卖打包台的小餐车，你主要负责菜谱和摆盘。

它最适合做 2D 和轻量 3D 游戏：角色、地图、按钮、音效都放进 collection；行为写在 script；对象之间用消息说话。README 里把仓库定位为 engine、editor 和 command line tools 的集合，官方文档则把 collection、game object、component 当作最基础的三块积木。

最小例子长这样：

```lua
function init(self)
  msg.post("#sprite", "enable")
  go.animate(".", "position.x", go.PLAYBACK_LOOP_PINGPONG, 120, go.EASING_LINEAR, 1)
end
```

上面不是完整游戏，但能看出 Defold 的味道：脚本不继承一个巨大类，而是给场景里的组件发消息、改属性、让引擎在下一帧执行。

## 为什么重要

不理解 Defold，下面这些事容易想不明白：

- 为什么小团队想同时发 Android、iOS、HTML5 和桌面版时，会在 Unity / Godot 之外看轻量引擎。
- 为什么 Lua 在游戏里常被当作“玩法胶水”：它写起来短，迭代快，又能被 C/C++ 引擎包住。
- 为什么 Defold 强调 message passing，而不是把所有对象写成互相引用的类。
- 为什么移动游戏会在意包体、内存预分配、资源动态加载这些看似底层的细节。

## 核心要点

1. **积木结构**：collection 像一个收纳盒，game object 像盒子里的单个道具，component 像贴在道具上的功能标签。你把角色、子弹、UI 都拆成这些积木，引擎负责把它们加载进游戏世界。

2. **消息驱动**：脚本之间不用直接抓住彼此的内部变量，而是用 `msg.post()` 发“请你做某事”的便条。好处是对象更松耦合，坏处是地址写错或消息没人接时，问题会到运行时才显出来。

3. **轻量打包**：官方 Bob 工具可以在命令行里 resolve、build、archive、bundle。类比：编辑器是厨房前台，Bob 是后厨流水线，适合把同一份项目自动打成不同平台的包。

## 实践案例

### 案例 1：敌人被打后通知 UI 加分

官方 message passing 手册用 hero、enemy、GUI 解释通信。改成新人能读的版本：

```lua
-- hero.script
self.score = self.score + 100
msg.post("/interface#gui", "update_score", { score = self.score })

-- gui_script.gui_script
function on_message(self, message_id, message, sender)
  if message_id == hash("update_score") then
    local node = gui.get_node("score")
    gui.set_text(node, "SCORE: " .. message.score)
  end
end
```

逐部分解释：

- `"/interface#gui"` 是目标地址，前半段找 game object，后半段找 GUI component。
- `"update_score"` 是消息名，接收方用 `hash()` 比较它。
- `{ score = self.score }` 是随信带过去的数据包，UI 不需要知道 hero 的内部实现。

### 案例 2：用 factory 运行时生成奖励物

官方 factory 手册展示了 `factory.create()` 生成对象，并在创建时传脚本属性：

```lua
-- spawner.script
local p = go.get_position()
p.y = p.y + 80
local id = factory.create("#star_factory", p, nil, { score = 10 }, 2.0)

-- star.script
go.property("score", 1)

function on_message(self, message_id, message, sender)
  if message_id == hash("collision_response") then
    msg.post("main#gui", "add_score", { amount = self.score })
    go.delete()
  end
end
```

逐部分解释：

- `#star_factory` 指当前对象上的 factory component。
- `{ score = 10 }` 覆盖 `star.script` 里的默认值，让同一个原型能生成不同分值的星星。
- `go.delete()` 表示吃到奖励后删除实例；官方文档提醒引擎底层已有对象池，不必自己再套一层池。

### 案例 3：不用打开编辑器也能打包

官方 Bob 手册给出的常见命令是先解析依赖、清理旧产物、构建归档，再按平台打包：

```sh
java -jar bob.jar --archive --platform x86_64-macos resolve distclean build bundle
```

逐部分解释：

- `resolve` 拉取外部库，类似先把食材备齐。
- `distclean build` 清掉旧结果再重新编译资源，避免旧缓存误导你。
- `bundle` 生成可分发应用；换成 `arm64-android` 或 `wasm-web`，就是另一条平台流水线。

## 踩过的坑

1. **把 collection 当运行时对象**：collection 更像编译前的收纳结构，运行时真正能寻址的是 game object 和 component。

2. **消息地址写得太随意**：`"enemy#controller"`、`"/enemy#controller"`、`"#controller"` 不是一回事，相对地址和绝对地址混用会让实例复用变难。

3. **脚本属性里写表达式**：`go.property("hp", 3 + 6)` 不会按你想的求值，官方文档说明构建时只解析字面量。

4. **误以为 factory 需要自建对象池**：官方 factory 手册明确说引擎已经做了对象池，额外池化通常更慢也更复杂。

## 适用 vs 不适用场景

**适用**：

- 小团队做 2D、休闲、益智、街机、轻量 3D 游戏，希望一份项目发多端。
- 需要 Lua 快速试玩法，但仍想要成熟编辑器、资源管线和命令行打包。
- 游戏对象数量和资源预算比较可控，愿意按 component / message 的方式组织逻辑。
- 移动优先项目，重视包体、启动、内存和跨平台交付。

**不适用**：

- 需要顶级 3A 级 3D 编辑能力、复杂可视化材质和大型开放世界工具链。
- 团队已经深度绑定 Unity、Unreal 或 Godot 的插件生态，不想换资产管线。
- 想用继承式 OOP 写全部玩法，不愿接受消息和组件拆分。
- 需要完全开放许可证语义时，要先读 Defold License；官方现在更常说 free to use 和 source available。

## 历史小故事（可跳过）

- **2000s 末期**：Defold 起源于瑞典团队的游戏工具探索，后来被 King 收购并在移动游戏背景下继续发展。
- **2016 年**：King 面向外部开发者免费发布 Defold，定位是轻量、跨平台、无版税的游戏引擎。
- **2020 年 5 月 19 日**：King 宣布公开 Defold 源码，并把产品、网站、构建服务和社区资产移交给 Defold Foundation。
- **2020 年之后**：项目在 GitHub 上持续迭代，README 显示仓库包含 engine、editor、Bob 等工具，星标量级已经到数千。
- **现在**：Defold 靠基金会、社区贡献和合作伙伴延续，文档也单独放在 `defold/doc` 仓库维护。

## 学到什么

- Defold 的核心不是“Lua 很简单”，而是把场景、对象、组件、消息和打包流水线做成一套小而完整的工作流。
- message passing 让游戏对象少一些硬引用，适合 prefab / collection 复用，但要求你认真命名和管理地址。
- factory 是运行时生成敌人、子弹、奖励物的标准方式，脚本属性让同一原型能表现出多种参数。
- 轻量引擎的价值在取舍：少一点巨型编辑器能力，换来更清晰的包体、资源和多端发布路径。

## 延伸阅读

- 官方仓库：[defold/defold](https://github.com/defold/defold) —— 引擎、编辑器和命令行工具的源码入口。
- 官方文档仓库：[defold/doc](https://github.com/defold/doc) —— manuals 的 Markdown 源文件。
- 官方手册：[Message passing](https://github.com/defold/doc/blob/master/docs/en/manuals/message-passing.md) —— 理解 Defold 对象通信。
- 官方手册：[Factory component](https://github.com/defold/doc/blob/master/docs/en/manuals/factory.md) —— 学会动态生成对象。
- [[godot]] —— 同样是游戏引擎，但编辑器和节点模型更重。
- [[love2d]] —— 同样用 Lua 做游戏，提供的是更薄的一层框架。

## 关联

- [[godot]] —— 对比节点式引擎和 Defold 的 component / message 组织方式。
- [[love2d]] —— 对比 Lua 游戏框架和完整游戏引擎的边界。
- [[cocos2d-x]] —— 都面向 2D / 移动游戏，但 C++ 框架和 Defold 工作流差异很大。
- [[phaser]] —— Web 游戏常用方案，可对比 HTML5 发布时的取舍。
- [[pixi]] —— 更偏渲染库，适合理解“引擎”和“图形层”的差别。
- [[bevy]] —— ECS 思路更强，对照 Defold 的 game object / component 能看出两种拆法。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
