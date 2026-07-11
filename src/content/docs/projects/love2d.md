---
title: LÖVE — 用 Lua 写 2D 游戏的轻量框架
来源: 'https://github.com/love2d/love'
日期: 2026-07-08
分类: graphics
难度: 初级
---

## 是什么

LÖVE 是一个**用 Lua 写 2D 游戏的开源框架**：你写 `main.lua`，它负责开窗口、跑主循环、收输入、画图、播声音。日常类比：像一个已经搭好的小剧场——舞台、灯光和计时器都准备好了，你只要让角色什么时候移动、什么时候画出来。

最小例子长这样：

```lua
function love.draw()
  love.graphics.print("Hello LÖVE", 80, 80)
end
```

把这段代码放进项目根目录的 `main.lua`，再运行 `love .`，窗口里就会出现一行文字。背后是 C++ 内核接 SDL、图形后端、音频库和 Lua/LuaJIT；你看到的入口却是一组很短的 `love.*` 回调。

所以 LÖVE 的价值不是“功能最全”，而是“零基础能很快把一张空窗口变成一个会动的小玩具”。

## 为什么重要

不理解 LÖVE，下面这些事会很难解释：

- 为什么很多游戏教学先从 `love.load` / `love.update` / `love.draw` 开始，而不是先讲复杂引擎编辑器。
- 为什么 Lua 能做游戏脚本：热重载轻、语法小、和 C/C++ 内核绑定成本低。
- 为什么“每帧更新状态，再每帧重画画面”是游戏开发最基本的呼吸节奏。
- 为什么同样是 2D，LÖVE 更像“代码框架”，而 [[godot]] 更像“编辑器里的完整引擎”。

## 核心要点

1. **回调就是节目单**：`love.load` 开场执行一次，`love.update(dt)` 每帧更新状态，`love.draw` 每帧画画面。类比：排练时先布景，再按节拍走位，最后让观众看到舞台。

2. **Lua 写玩法，C++ 扛底层**：你用 Lua 写角色移动、碰撞判断和菜单逻辑，LÖVE 用 C++ 接窗口、渲染、音频、文件系统。类比：你在前台点菜，后厨已经接好水电煤气。

3. **模块按用途分区**：`love.graphics` 负责绘制，`love.keyboard` 读键盘，`love.filesystem` 读写文件，`love.audio` 播声音。类比：工具箱里每一格放一种工具，新手不用先翻完整引擎源码。

## 实践案例

### 案例 1：从空窗口画出第一块东西

官方 wiki 的入门路线强调：LÖVE 会从包含 `main.lua` 的文件夹或 `.love` 包启动游戏。最小项目可以只有一个文件：

```lua
-- main.lua
function love.draw()
  love.graphics.setColor(0.2, 0.8, 0.3, 1)
  love.graphics.rectangle("fill", 60, 60, 120, 80)
  love.graphics.setColor(1, 1, 1, 1)
  love.graphics.print("player", 82, 92)
end
```

运行命令：

```bash
love .
```

**逐部分解释**：`love.draw` 是画面输出口，LÖVE 每帧都会调用它；`setColor` 会影响后续绘制；`rectangle("fill", x, y, w, h)` 画一个实心矩形；`print` 把文字画到坐标上。这里没有手动创建窗口，因为框架已经把窗口和主循环包好了。

### 案例 2：用方向键移动一个方块

输入教程的核心姿势是：在 `update` 里读键盘，在 `draw` 里只负责画当前状态。

```lua
local player = { x = 100, y = 100, speed = 220 }

function love.update(dt)
  if love.keyboard.isDown("right") then player.x = player.x + player.speed * dt end
  if love.keyboard.isDown("left") then player.x = player.x - player.speed * dt end
  if love.keyboard.isDown("down") then player.y = player.y + player.speed * dt end
  if love.keyboard.isDown("up") then player.y = player.y - player.speed * dt end
end

function love.draw()
  love.graphics.rectangle("fill", player.x, player.y, 32, 32)
end
```

**逐部分解释**：`player` 是游戏状态，不是画出来的图；`dt` 是上一帧到这一帧经过的秒数，乘上它以后高帧率和低帧率移动速度一致；`love.keyboard.isDown` 读取当前按键是否按住；`draw` 每帧按最新坐标重画。

### 案例 3：把测试套件当普通 LÖVE 项目运行

LÖVE 仓库的 `testing/` 目录很有代表性：官方 README 说测试覆盖 API，并且像普通 LÖVE 项目一样运行。

```bash
love testing
love testing --modules filesystem,graphics
love testing --method filesystem read
```

测试方法本身也是 Lua：

```lua
love.test.filesystem.read = function(test)
  local content, size = love.filesystem.read("resources/test.txt")
  test:assertNotNil(content)
  test:assertEquals("helloworld", content, "check content match")
  test:assertEquals(10, size, "check size match")
end
```

**逐部分解释**：第一条命令跑全部测试；`--modules` 只跑指定模块；`--method` 精确到一个 API 方法；测试代码直接调用 `love.filesystem.read`，和游戏里读存档、读配置的方式一样。这说明 LÖVE 的 API 设计目标很朴素：测试、示例和真实游戏都跑在同一个运行时里。

## 踩过的坑

1. **项目根目录没有 `main.lua`**：LÖVE 启动时找不到入口，就不会知道游戏从哪里开始。

2. **把更新逻辑写进 `love.draw`**：`draw` 可能被调用很多次，状态变化应该放在 `update(dt)`，否则调试和暂停都会乱。

3. **忘记乘 `dt`**：每帧直接 `x = x + speed` 会让高刷新率电脑上的角色跑得更快，因为速度被帧数绑死了。

4. **照抄旧教程的颜色值**：LÖVE 11 以后颜色分量用 `0..1`，旧教程里的 `255, 0, 0` 会变成错误心智。

## 适用 vs 不适用场景

**适用**：

- Game Jam、小练习、教学 demo，需要今天写、今天看到窗口里有东西动。
- 2D 小游戏、像素风原型、粒子和音频实验，核心玩法比编辑器工作流更重要。
- 想学习游戏循环、输入、绘制、资源加载这些底层概念，而不是一开始被完整引擎淹没。
- 已经喜欢 Lua，想用脚本快速试玩法，同时保留跨 Windows、macOS、Linux、Android、iOS 的可能。

**不适用**：

- 需要完整可视化编辑器、场景树、动画时间线和导出面板的新手团队，优先看 [[godot]]。
- 大型 3D 项目或写实渲染项目，LÖVE 的主战场是 2D。
- 需要大量现成商业资产、插件市场和团队协作管线，Unity / Unreal 更成熟。
- 普通网页 UI 或数据可视化，浏览器里用 [[pixi]] / DOM / Canvas 更直接。

## 历史小故事（可跳过）

- **2008 年前后**：LÖVE 作为“Lua 写 2D 游戏”的小框架出现，入口一直围绕 `main.lua` 和回调函数。
- **后来多年**：社区把文档主要维护在 wiki，上手路径围绕 Getting Started、Callback Functions、graphics/input/audio 模块展开。
- **近几年**：仓库 README 明确说明 `main` 分支面向下一个大版本开发，稳定使用应看 release 分支和 tag。
- **2020s**：官方测试套件逐步成形，目标是用 Lua、少依赖、像开发者使用 API 一样测试 API。
- **现在**：GitHub 上是 8k+ stars 量级，定位仍然很清楚：小而自由的 Lua 2D 游戏框架。

## 学到什么

- LÖVE 把游戏入门压缩成三件事：加载一次、每帧更新、每帧绘制。
- “Lua 脚本 + C++ 内核”是一种常见架构：脚本层快改，内核层负责性能和平台差异。
- 轻量框架的优势是概念少、反馈快；代价是编辑器、资产管线和大团队协作要自己补。
- 学 LÖVE 的真正收获不是背 API，而是建立“状态和绘制分离”的游戏循环直觉。

## 延伸阅读

- 官方仓库：[love2d/love](https://github.com/love2d/love) —— README 写清了平台、构建、测试和贡献入口。
- 官方 wiki：[LÖVE Wiki](https://love2d.org/wiki) —— API、教程、回调函数和模块索引都在这里。
- 测试文档：[testing/readme.md](https://github.com/love2d/love/tree/main/testing) —— 看官方如何把 API 测试写成普通 LÖVE 项目。
- 设计讨论：[Testing suite for LÖVE's APIs](https://github.com/love2d/love/issues/1745) —— 可以看到测试套件为什么追求简单 Lua 和少平台依赖。
- [[godot]] —— 对照“轻量代码框架”和“完整编辑器引擎”的差异。
- [[pixi]] —— 对照浏览器里的高性能 2D 渲染路线。

## 关联

- [[godot]] —— 同样服务游戏开发，但 Godot 把编辑器、节点、物理和导出都包进来。
- [[pixi]] —— 同样是 2D 图形心智，Pixi 主战场在浏览器，LÖVE 主战场在本地 Lua 游戏。
- [[cocos2d-x]] —— 都有 2D 游戏传统，Cocos2d-x 更偏 C++/移动端工程化。
- [[bevy]] —— 对照“回调循环”与 ECS 调度，两种组织游戏逻辑的方式差异很大。
- [[panda3d]] —— 都是代码优先的游戏框架，但 Panda3D 更偏 Python/C++ 和 3D。
- [[minetest]] —— 同样用 Lua 做可扩展玩法，Minetest 是完整沙盒游戏/引擎生态。
- [[prosody]] —— 同样展示 Lua 作为嵌入式脚本语言的轻量和可扩展性。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[defold]] —— Defold — King 出品的 Lua 跨平台游戏引擎
- [[heaps]] —— Heaps — Haxe 跨平台高性能游戏引擎
- [[tiled]] —— Tiled Map Editor — 通用 2D 关卡编辑
