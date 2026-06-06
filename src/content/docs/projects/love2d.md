---
title: LÖVE — Lua 2D 游戏框架
来源: 'https://github.com/love2d/love'
日期: 2026-06-06
分类: 图形学
子分类: 渲染与图形
难度: 初级
---

## 是什么

LÖVE（读作 "love"）是一个用 **Lua 语言**写 2D 游戏的免费开源框架。日常类比：它就像一个"组装好的游乐场"——跑道、灯光、音响都装好了，你只要用一张纸（Lua 脚本）写规则，五分钟内就能看到一个会动的角色出现在屏幕上。

底层是 C++ 写的核心，封装了 SDL3（窗口与输入）、OpenGL/Vulkan/Metal（图形渲染）、OpenAL（音频）等库。Lua 脚本层通过三个回调函数驱动整个游戏循环：

```lua
function love.load()   -- 程序启动时调用一次：加载图片、音效等资源
end

function love.update(dt) -- 每帧调用：dt 是距上一帧过去的秒数，用它算移动
end

function love.draw()   -- 每帧调用：在屏幕上画东西
end
```

这三个函数就是 LÖVE 的全部入口。LÖVE 自动维护帧循环，你只需要填内容。GitHub 超过 8k star，支持 Windows / macOS / Linux / Android / iOS 发布。

## 为什么重要

不了解 LÖVE，下面这些事都难以解释：

- 为什么初学者能用**十行 Lua**跑出一个可交互游戏原型——框架把图形/音频的 C++ 复杂度完全隐藏
- 为什么游戏逻辑要把**更新**和**绘制**分开——`update(dt)` 管状态、`draw()` 管画面，职责清晰才能保证帧率稳定
- 为什么 `dt`（delta time）如此关键——不用 dt，游戏在不同性能的电脑上跑出不同速度
- 为什么"打包成 `.love` 文件"能跨平台运行——本质是 ZIP，LÖVE 运行时自动解压执行 `main.lua`

## 核心要点

1. **三回调驱动模型**：`love.load` → `love.update(dt)` → `love.draw()` 组成一次完整帧。类比流水线工厂：load 是"进货"，update 是"加工"，draw 是"展示"。每一帧 LÖVE 自动调这三步，你只填内容。

2. **坐标系：原点在左上角，y 向下**：屏幕左上角是 `(0, 0)`，x 向右、y 向下增大。和数学的笛卡尔坐标系正好上下颠倒——从数学迁移过来的人第一次画东西经常"上下反"。记住：`love.graphics.draw(img, 100, 200)` 表示"距左边 100px、距上边 200px"。

3. **资源必须在 `love.load` 里创建**：图片（`love.graphics.newImage`）、音效（`love.audio.newSource`）都是"重"对象，只能创建一次，存在全局变量里给 update/draw 用。如果在 `draw()` 里每帧 `newImage`，帧率会崩。类比：你不会每次演出前重新搬一遍钢琴，提前搬好放在舞台边上。

## 实践案例

### 案例 1：五行 Hello World——理解三回调骨架

```lua
-- main.lua
function love.load()
  msg = "Hello, LÖVE!"
end

function love.update(dt)
  -- 这个例子不需要每帧更新任何状态
end

function love.draw()
  love.graphics.print(msg, 300, 250)
end
```

**逐部分解释**：

- `love.load`：把字符串存进全局变量 `msg`。只跑一次。
- `love.update(dt)`：本例状态不变，留空也要写出来（不写 LÖVE 也能跑，但养成习惯）。
- `love.draw`：每帧把 `msg` 打印到坐标 `(300, 250)`。`love.graphics.print` 第二三参数是 x、y 像素坐标。

运行：把 `main.lua` 放在文件夹里，拖到 LÖVE 可执行文件上，或 `love .` 命令行启动。

### 案例 2：弹球小游戏——update + draw 分工 + 碰撞检测

```lua
function love.load()
  ball = { x = 400, y = 300, vx = 200, vy = 150, r = 10 }
  w, h = love.graphics.getDimensions()
end

function love.update(dt)
  ball.x = ball.x + ball.vx * dt   -- 用 dt 保证各帧速度一致
  ball.y = ball.y + ball.vy * dt

  if ball.x - ball.r < 0 or ball.x + ball.r > w then
    ball.vx = -ball.vx             -- 碰到左右边界，水平方向反弹
  end
  if ball.y - ball.r < 0 or ball.y + ball.r > h then
    ball.vy = -ball.vy             -- 碰到上下边界，垂直方向反弹
  end
end

function love.draw()
  love.graphics.circle("fill", ball.x, ball.y, ball.r)
end
```

**逐部分解释**：

- `ball.vx * dt`：速度（像素/秒）乘以帧间隔秒数，得到本帧位移。帧率 60fps 时 dt≈0.016，30fps 时 dt≈0.033，位移自动缩放，球速恒定。
- 碰撞逻辑全在 `update` 里：只管"应该发生什么"，不管"怎么画"。
- `love.graphics.circle`：第一参数 `"fill"` 表示实心圆，`"line"` 是空心圆。

### 案例 3：精灵动画——Quad 切帧，理解图集（spritesheet）

```lua
function love.load()
  sheet = love.graphics.newImage("hero.png")  -- 整张精灵图集
  frameW, frameH = 64, 64
  frames = {}
  for i = 0, 3 do
    -- Quad 定义从图集哪块区域取这帧
    frames[i+1] = love.graphics.newQuad(
      i * frameW, 0, frameW, frameH,
      sheet:getDimensions()
    )
  end
  currentFrame = 1
  timer = 0
end

function love.update(dt)
  timer = timer + dt
  if timer > 0.1 then          -- 每 0.1 秒换一帧
    timer = 0
    currentFrame = currentFrame % 4 + 1
  end
end

function love.draw()
  love.graphics.draw(sheet, frames[currentFrame], 200, 200)
end
```

**逐部分解释**：

- `newImage` 只加载一次整张图集（提高 GPU 效率）。
- `newQuad` 定义"视口"：从图集 `(x=i*64, y=0)` 处取 64×64 的区域，不同 `i` 对应不同帧。
- `love.draw` 里用 `draw(sheet, quad, x, y)` 语法：告诉 LÖVE "从 sheet 里截取 quad 这块，画到 (200,200)"。

## 踩过的坑

1. **资源在 `love.draw` 里每帧 `newImage`**：`love.graphics.newImage` 会上传纹理到 GPU，每帧调用帧率直接崩。资源**必须**在 `love.load` 创建，全局变量保存，draw 里只调用 `draw()`。

2. **不用 `dt` 导致速度随帧率变化**：`x = x + 5` 在 30fps 机器上每秒移动 150px，在 144fps 机器上每秒移动 720px——速度差 4.8 倍。正确写法：`x = x + speed * dt`，`speed` 单位是像素/秒。

3. **y 轴方向弄反**：坐标原点在**左上角**，y 向下增大。"向下移"要 `y = y + speed * dt`，不是减。从数学思维迁移过来的人常把游戏画面"上下颠倒"。

4. **`.love` 打包时 `main.lua` 没在压缩包根目录**：正确做法是进入项目目录，把所有文件（`main.lua`、图片、音效）打进 ZIP 并改后缀为 `.love`。如果 `main.lua` 在 ZIP 里的子目录 `myproject/main.lua`，LÖVE 找不到入口，双击直接黑屏。

## 适用 vs 不适用场景

**适用**：

- 游戏开发入门——五分钟能看到运行结果，零学习曲线
- Ludum Dare / LÖVE Jam 等 Game Jam——快速原型，打包简单
- 2D 独立游戏小规模商业发布（已有多款上 Steam）
- 大学游戏课程教学演示——Lua 语法简洁，老师讲解负担低
- 跨平台发布：同一份代码发 Windows / macOS / Linux / Android / iOS

**不适用**：

- 3D 游戏——LÖVE 没有 3D 渲染管线，需要 Godot / Unity 等
- 大型商业项目——没有内置场景编辑器、资产管线、物理引擎深度集成
- 团队协作大型工程——Lua 的动态类型在大规模代码库难以维护
- 需要高性能着色器的特效——可以写自定义 GLSL，但工具链比 Unity/Unreal 薄得多

## 历史小故事（可跳过）

- **2008 年**：Björn Ritzl 等人在 Google Code 发起 LÖVE 项目，目标是给 Lua 爱好者提供一个"没有门槛的 2D 游戏沙盒"，最初只支持 Windows，API 极简。
- **2013 年**：迁移到 GitHub，开始吸引全球 Lua 开发者贡献代码，Ludum Dare 社区大量使用 LÖVE 参赛，知名度快速上升。
- **2019 年**：11.x 发布，正式加入 Android 和 iOS 支持，移动端发布从此成为标配。同年 `love.graphics` 底层切换到更现代的图形 API 路径。
- **2024 年**：12.x 主线开发启动，内核向 SDL3、Vulkan 和 Metal 迁移——从 OpenGL ES 时代进入现代图形 API 时代，为下一个十年做底层准备。
- 如今 LÖVE 社区每年举办 LÖVE Jam，itch.io 上已有数千款 LÖVE 游戏，框架本身保持极简哲学：不内置物理引擎（推荐 Box2D 绑定 `love.physics`），不强制场景树，所有东西都是 Lua 表。

## 学到什么

1. **三回调分层是游戏引擎的最小正交设计**：load / update / draw 三层职责不重叠，任何 2D 游戏的逻辑都能往这三个桶里装——这个模式在 Pygame、Phaser、Godot 里都有变体。
2. **`dt` 是帧率无关的关键**：游戏速度应该以"像素/秒"而非"像素/帧"为单位，乘以 delta time 是让游戏在任何硬件上体验一致的最小代价。
3. **图集（spritesheet）+ Quad 是 2D 动画的标准做法**：减少 GPU 纹理切换次数，一张大图比多张小图快，这个原则在 Web 的 CSS sprite 和游戏引擎里是通用的。
4. **极简框架反而教得更好**：LÖVE 不隐藏帧循环、不隐藏坐标系，新手被迫理解底层机制，比"拖拽组件式"引擎的学习效果更扎实。

## 延伸阅读

- 官方文档：[LÖVE Wiki](https://love2d.org/wiki/Main_Page)（每个 API 都有示例代码，中文社区也有翻译）
- 视频教程：[CS50's Introduction to Game Development — LÖVE 2D](https://cs50.harvard.edu/games/2018/weeks/0/)（哈佛公开课，从零写贪吃蛇到 Flappy Bird）
- 书籍：[Game Development with LÖVE 2D and Lua（Sheepolution）](https://sheepolution.com/learn/book/1)（免费在线书，从 Hello World 到完整游戏，图文并茂）
- 社区：[r/love2d](https://www.reddit.com/r/love2d/)（问题、展示、jam 公告）
- [[phaser]] —— 同为 2D 游戏框架，Phaser 面向 Web/JavaScript，LÖVE 面向 Lua/原生
- [[cocos2d-x]] —— C++ 底层类似，定位移动端商业游戏，比 LÖVE 重

## 关联

- [[phaser]] —— 同为 2D 游戏框架，Phaser 在浏览器跑，LÖVE 在原生客户端跑，API 风格高度相似
- [[cocos2d-x]] —— C++ 内核 + 脚本层架构一致，Cocos 更重工业级，LÖVE 更轻教学
- [[kajiya-1986-rendering-equation]] —— 渲染方程是 OpenGL/Vulkan 的理论根基，LÖVE 的 love.graphics 底层依赖它
- [[sprite-1988]] —— Sprite 概念起源，LÖVE 的 Quad+图集是精灵技术的现代实现
- [[luajit]] —— LÖVE 默认用 LuaJIT 运行脚本，LuaJIT 的 JIT 编译给了 LÖVE 相当高的性能天花板
- [[sdl]] —— LÖVE 12.x 底层窗口与输入依赖 SDL3，SDL 是跨平台游戏基础设施事实标准
- [[openal]] —— LÖVE 音频系统基于 OpenAL，理解 OpenAL 能帮助调试 LÖVE 音频 bug

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

