---
title: LÖVE — 五分钟让 Lua 游戏跑起来的 2D 框架
来源: 'https://github.com/love2d/love'
日期: 2026-06-06
分类: 图形学
子分类: 渲染与图形
难度: 初级
---

## 是什么

LÖVE 是一个**用 Lua 脚本语言制作 2D 游戏的免费开源框架**。日常类比：就像乐高积木——C++ 内核帮你准备好了"图形块"、"声音块"、"输入块"，你只需要用 Lua 把它们拼起来，就能看到游戏动起来。

你写的最小完整游戏只需要这几行 Lua：

```lua
function love.load()
  msg = "Hello, LÖVE!"
end

function love.draw()
  love.graphics.print(msg, 400, 300)
end
```

保存为 `main.lua`，在命令行跑 `love .`，屏幕正中就会出现一行文字。**没有 IDE 配置、没有编译步骤、没有依赖安装**——这就是 LÖVE 最吸引新手的地方。

框架底层由 C++ 写成，依赖 SDL3（跨平台窗口/输入）、OpenGL/Vulkan/Metal（图形渲染）、OpenAL（音频）、LuaJIT（脚本运行时）等成熟库。它支持 Windows、macOS、Linux、Android、iOS，打包成一个 `.love` 文件（本质是 zip）就能发布。

## 为什么重要

不理解 LÖVE 的设计，下面这些事都没法解释：

- 为什么这么多 Ludum Dare/Game Jam 参赛者选它——三回调结构让 72 小时内从零到可玩原型成为可能
- 为什么同样是 2D 框架，LÖVE 比 Unity 学习曲线低一个数量级——没有"项目设置"、没有场景编辑器，一个文本文件就是整个游戏
- 为什么 `dt`（delta time）在游戏编程里如此关键——LÖVE 把帧循环显式暴露给开发者，让你亲眼看到帧率与运动速度的关系
- 为什么 Lua 被称为"最适合嵌入 C++ 的脚本语言"——LÖVE 就是最经典的 C++/Lua 混合架构教科书案例

## 核心要点

LÖVE 游戏运行的本质可以拆成**三个回调 + 一个帧循环**：

1. **`love.load()`：只跑一次的初始化**
   像搬家时的装车——把所有资源（图片、音效、字体）装载好，存进变量备用。不在这里做的事情放进 `draw()` 会导致每帧重复加载，帧率崩溃。

2. **`love.update(dt)`：每帧更新游戏状态**
   参数 `dt` 是上一帧到这帧的**时间差（秒）**，类比心跳间隔。所有运动都要乘以 `dt`：`x = x + speed * dt`——这样无论玩家用 30 fps 的老电脑还是 144 fps 的游戏本，球的移动距离一样。

3. **`love.draw()`：每帧把状态画到屏幕**
   这里只做"描述当前状态该长什么样"，不做逻辑运算。把逻辑和渲染分开是所有游戏引擎的基本原则。

三个回调加起来，构成游戏的**主循环**。LÖVE 的框架会在每一帧自动调用 `update` 和 `draw`，你只需要填内容。

## 实践案例

### 案例 1：Hello World——三回调骨架

最小可运行游戏，展示三回调的分工：

```lua
-- main.lua
function love.load()
  -- 初始化：定义玩家初始状态
  player = { x = 100, y = 100, speed = 200 }
end

function love.update(dt)
  -- 每帧更新：根据按键移动玩家
  if love.keyboard.isDown("right") then
    player.x = player.x + player.speed * dt
  end
  if love.keyboard.isDown("left") then
    player.x = player.x - player.speed * dt
  end
end

function love.draw()
  -- 每帧渲染：画一个代表玩家的矩形
  love.graphics.rectangle("fill", player.x, player.y, 32, 32)
end
```

**逐部分解释**：
- `love.load` 里定义 `player` 表，存坐标和速度
- `love.update(dt)` 里检测按键，用 `speed * dt` 保证帧率无关
- `love.draw()` 里用 `love.graphics.rectangle` 画一个 32×32 的实心方块
- 按左右方向键，方块就会移动

### 案例 2：加载图片与精灵动画

从文件加载图片，用 Quad 切割精灵图（sprite sheet）播放动画：

```lua
function love.load()
  -- 加载整张精灵图（假设 4 帧横排，每帧 32×32）
  spriteSheet = love.graphics.newImage("player.png")
  local frameW, frameH = 32, 32
  quads = {}
  for i = 0, 3 do
    quads[i+1] = love.graphics.newQuad(
      i * frameW, 0,       -- 左上角 x, y
      frameW, frameH,      -- 宽, 高
      spriteSheet:getDimensions()
    )
  end
  frame = 1
  timer = 0
end

function love.update(dt)
  timer = timer + dt
  if timer > 0.15 then  -- 每 0.15 秒切一帧
    timer = 0
    frame = frame % 4 + 1
  end
end

function love.draw()
  love.graphics.draw(spriteSheet, quads[frame], 200, 200)
end
```

**逐部分解释**：
- `newImage` 把图片文件读进显存
- `newQuad` 在整张大图里"开窗口"，定义每帧的位置和尺寸——这就是精灵图的核心：一张图片装多帧，减少 GPU 纹理切换开销（参见 [[sprite-1988]]）
- `timer` 累积 dt，超过阈值后切帧，是最简单的帧动画计时器

### 案例 3：播放音效与碰撞检测

一个完整的弹球示例，展示音效 + 简单碰撞：

```lua
function love.load()
  ball = { x = 400, y = 300, vx = 250, vy = -200, r = 10 }
  bounceSound = love.audio.newSource("bounce.wav", "static")
  paddle = { x = 350, y = 550, w = 100, h = 15 }
end

function love.update(dt)
  -- 移动小球
  ball.x = ball.x + ball.vx * dt
  ball.y = ball.y + ball.vy * dt

  -- 碰壁反弹（左右）
  if ball.x - ball.r < 0 or ball.x + ball.r > 800 then
    ball.vx = -ball.vx
    bounceSound:play()  -- LÖVE 11.x 起用 Source:play()，全局 love.audio.play() 已废弃
  end

  -- 碰顶反弹
  if ball.y - ball.r < 0 then
    ball.vy = -ball.vy
  end

  -- 移动挡板
  if love.keyboard.isDown("left") then
    paddle.x = math.max(0, paddle.x - 300 * dt)
  end
  if love.keyboard.isDown("right") then
    paddle.x = math.min(700, paddle.x + 300 * dt)
  end

  -- 球拍碰撞（AABB 检测：两个未旋转矩形是否重叠）
  if ball.y + ball.r > paddle.y
     and ball.x > paddle.x
     and ball.x < paddle.x + paddle.w then
    ball.vy = -math.abs(ball.vy)
    bounceSound:play()
  end
end

function love.draw()
  love.graphics.circle("fill", ball.x, ball.y, ball.r)
  love.graphics.rectangle("fill", paddle.x, paddle.y, paddle.w, paddle.h)
end
```

**逐部分解释**：
- `newSource("file.wav", "static")` 把短音效整体加载进内存，适合频繁播放；长音乐用 `"stream"` 避免占用大量内存
- AABB（轴对齐包围盒）碰撞：检查两个**没有旋转**的矩形是否重叠——是游戏里最简单实用的碰撞算法
- `bounceSound:play()` 是 LÖVE 11.x 的正确写法；旧版全局 `love.audio.play()` 已在 11.x 中废弃

## 踩过的坑

1. **资源在 `draw()` 里反复加载**：`love.graphics.newImage` 放进 `draw` 会导致每秒加载 60 次，帧率直接跌到个位数，必须放进 `love.load`。

2. **忘用 `dt` 导致速度随帧率漂移**：写 `x = x + 5` 而非 `x = x + speed * dt`——60 fps 的机器上速度是 30 fps 机器的两倍，玩家反映"游戏卡了"时其实是你的帧率更低了。

3. **坐标系 y 轴向下**：左上角是 `(0, 0)`，y 增大往屏幕下方走。从数学平面（y 向上）迁移的新手会发现图形上下颠倒、"向上跳"却要减 y 值——需要主动在脑袋里切换。

4. **打包 `.love` 文件时 `main.lua` 不在根目录**：`zip -j game.love src/*` 会把 `main.lua` 直接放在根，但 `zip game.love src/` 会形成子目录，LÖVE 找不到入口点，双击只有黑屏。正确做法是 `cd src && zip -r ../game.love .`。

## 适用 vs 不适用场景

**适用**：
- 学习游戏编程基础（帧循环、碰撞、音效）的第一个框架
- Ludum Dare、Game Jam 等限时比赛快速原型
- 简单的 2D 休闲游戏、像素艺术游戏独立发行
- 演示算法可视化（排序、路径寻找等）——比 canvas/matplotlib 更直观
- 嵌入式 Lua 宿主应用（需要 C++/Lua 跨语言调用范例）

**不适用**：
- 3D 游戏——LÖVE 只做 2D，没有内置 3D 场景图
- 超大型商业项目——缺乏 Unity/Godot 的可视化编辑器、场景序列化、团队协作工具
- 需要游戏物理引擎深度定制——内置 Box2D 绑定（`love.physics`）对复杂物理场景有局限
- 需要 ECS（Entity-Component-System）架构的大规模 AI 场景

## 历史小故事（可跳过）

- **2008 年**：Björn Ritzl 等人在 Google Code 上发布 LÖVE 初版，初衷是给 Lua 爱好者一个"无需图形学知识也能看到东西动起来"的沙盒。
- **2013 年前后**：代码库迁移到 GitHub，社区开始爆发式增长，LÖVE 逐渐成为 Ludum Dare 等 Game Jam 中最常被选用的框架之一。
- **2018-2019 年**：LÖVE 11.x 正式发布，带来 HiDPI 支持、改进的音频 API（`Source:play()` 替代全局 `love.audio.play()`）以及 Android/iOS 平台支持。
- **2019-2023 年**：LÖVE Jam 成为年度固定赛事，吸引全球数百位开发者，部分参赛作品登上 itch.io 下载榜。
- **2024 年起**：主线分支 `main` 向 SDL3 + Vulkan/Metal 渲染后端迁移（12.x），准备拥抱新一代图形 API，同时宣告不再接受由 LLM/生成式 AI 辅助生成的 PR。

## 学到什么

1. **三回调框架是所有实时渲染系统的最小骨架**：load（初始化）/ update（状态机推进）/ draw（状态可视化）——这套思路在 Pygame、Phaser.js、Unity MonoBehaviour 里一脉相承。
2. **dt 是帧率无关游戏逻辑的关键**：把"每帧移多少"换成"每秒移多少"，用 `dt` 折算，游戏就能在任意帧率下行为一致。
3. **C++/Lua 混合架构是性能与灵活性的折中**：C++ 处理渲染/音频等性能敏感路径，Lua 处理逻辑/脚本等需要快速迭代的部分——这是游戏引擎和嵌入式系统的常见架构模式。
4. **零依赖部署降低摩擦是产品成功的关键**：`.love` 文件打包模式让"把游戏发给朋友玩"的成本接近零，社区传播因此自然发生。

## 延伸阅读

- 官方文档：[LÖVE Wiki](https://love2d.org/wiki/Main_Page)（完整 API 参考，每个函数都有示例）
- 视频教程：[CS50's Introduction to Game Development](https://cs50.harvard.edu/games/)（哈佛 CS50 用 LÖVE 讲游戏编程，免费公开课）
- 书籍：[Game Programming Patterns](https://gameprogrammingpatterns.com/)（解释游戏开发中的设计模式，语言无关，配合 LÖVE 实践）
- [[sprite-1988]] —— 精灵图技术起源，理解 LÖVE 的 `newQuad` 为何这样设计
- [[kajiya-1986-rendering-equation]] —— 渲染方程基础，LÖVE 简化的光照模型背后的理论
- [[phaser]] —— JavaScript 生态中与 LÖVE 定位最接近的 2D 游戏框架

## 关联

- [[sprite-1988]] —— LÖVE 的 `love.graphics.newQuad` 本质是经典精灵图切割技术的现代封装
- [[cocos2d-x]] —— 同为 C++ 内核 + 脚本层的 2D 游戏框架，面向移动端商业项目，与 LÖVE 形成对比
- [[phaser]] —— 基于 WebGL/Canvas 的 JavaScript 2D 游戏框架，浏览器端与 LÖVE 桌面端的互补选择
- [[kajiya-1986-rendering-equation]] —— 渲染管线的理论基础，LÖVE 的 OpenGL 后端所处理的正是光照传输方程的简化版
- [[debevec-1998-rendering-with-natural-light]] —— 现代渲染中基于图像的光照理论，了解 LÖVE Shader 能做到什么、做不到什么的参照系

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
