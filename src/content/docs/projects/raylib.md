---
title: raylib — 极简 C 游戏库
来源: https://github.com/raysan5/raylib
日期: 2026-06-06
子分类: 渲染与图形
分类: 图形学
难度: 初级
provenance: pipeline-v3
---

## 是什么

**raylib** 是一个用纯 C99 写成的游戏/图形编程库，口号是"just coding in the most pure spartan-programmers way"——没有可视化编辑器、没有 GUI 工具，只有一个头文件和一批函数。

日常类比：SDL2 相当于给你一块空地 + 铲子，OpenGL 相当于给你一座矿山，而 raylib 相当于给你一套预装好的乐高积木——窗口、键盘输入、图片加载、声音播放、3D 模型渲染，全都是现成的砖块，按说明书拼就行。

底层基石：

- **rlgl**：raylib 自研的 OpenGL 抽象层，统一支持 OpenGL 1.1 / 2.1 / 3.3 / 4.3 / ES 2.0 / ES 3.0，还有一个纯软件渲染后端（rlsw）
- **GLFW**（内嵌版）：跨平台窗口 + 输入管理
- **miniaudio / stb** 等第三方库：全部内嵌在 `src/external`，**不需要额外安装任何依赖**

发布于 2013 年，作者是西班牙程序员 Ramon Sanchez（raysan5）；灵感来自 Borland BGI 和微软 XNA，最初目标是让编程课的学生不用装任何 IDE 就能跑起图形程序。截至 2026 年，GitHub Stars 超过 33k，拥有 70+ 语言绑定。

## 为什么重要

学图形编程的人通常遇到几个经典障碍：

- **OpenGL 入门壁垒高**：光初始化上下文就要写 200+ 行 boilerplate，还没开始画任何东西
- **SDL2 功能碎片**：本体只管窗口和输入，图片要 SDL_image，字体要 SDL_ttf，音频要 SDL_mixer，各自安装链接
- **游戏框架太重**：Unity / Godot 功能强大，但学它本身就是另一门课，遮住了底层发生的事

raylib 解决这三个问题：

- 一行 `InitWindow(800, 450, "hello")` 窗口就出来了，没有 boilerplate
- 字体、纹理、音频、3D 全在同一个库里，一次链接搞定
- API 足够薄，你依然能感受到帧循环、纹理上传、着色器绑定这些图形编程本质，学完可以无缝迁移到更底层的 OpenGL 或 Vulkan

另一个维度：**教育场景**。raylib 的 140+ 官方示例覆盖从"画个彩色正方形"到"PBR 材质 + 骨骼动画"，几乎是一本活的图形编程课本。西班牙、法国、美国的多所大学已把它作为图形课入门工具。

## 核心要点

### 模块划分

raylib 核心拆成 7 个模块，每个可以单独编译使用：

| 模块 | 职责 |
|------|------|
| `core` | 窗口、输入（键盘/鼠标/手柄）、时间、帧循环 |
| `shapes` | 2D 基本形状（矩形、圆、三角、多边形） |
| `textures` | 图片加载（PNG/JPG/BMP/DDS…）、纹理操作 |
| `text` | TTF/OTF/BMFont 字体加载、文字绘制 |
| `models` | 3D 网格、模型加载（OBJ/glTF/IQM）、骨骼动画 |
| `audio` | 声音加载（WAV/MP3/OGG）、音效 / 流媒体播放 |
| `rlgl` | OpenGL 抽象层，可单独作为轻量级渲染后端 |

### 游戏循环心智模型

raylib 的帧循环只有四步：

```c
InitWindow(width, height, "title");   // 1. 创窗口
while (!WindowShouldClose()) {        // 2. 每帧循环
    // 更新游戏逻辑
    BeginDrawing();                   // 3. 开始绘制
        ClearBackground(RAYWHITE);
        // 画各种东西
    EndDrawing();                     // 4. 提交帧
}
CloseWindow();                        // 5. 清理
```

`BeginDrawing()` 绑定帧缓冲，`EndDrawing()` 交换缓冲区并处理事件，所有 Draw* 调用必须在这对括号里。

### API 命名规范

全库统一 PascalCase 动词前缀命名，看名字就知道做什么：

- `Init*` / `Close*`：初始化和清理（InitWindow / CloseWindow）
- `Load*` / `Unload*`：资源上传 GPU / 释放（LoadTexture / UnloadTexture）
- `Begin*` / `End*`：状态对（BeginDrawing / EndDrawing、BeginMode3D / EndMode3D）
- `Draw*`：绘制（DrawText / DrawTexture / DrawSphere）
- `Is*` / `Get*`：查询（IsKeyDown / GetMousePosition）

### 着色器支持

raylib 支持自定义 GLSL 着色器，内置后处理链：

```c
Shader shader = LoadShader(0, "bloom.frag");  // 只需片元着色器
BeginShaderMode(shader);
    DrawTexture(tex, 0, 0, WHITE);
EndShaderMode();
UnloadShader(shader);
```

`LoadShaderFromMemory` 可以直接传字符串，方便内嵌在代码里。

## 实践案例

### 案例 1：10 行 Hello World

最小可运行程序，验证环境搭建：

```c
#include "raylib.h"

int main(void)
{
    InitWindow(800, 450, "raylib — Hello World");

    while (!WindowShouldClose())
    {
        BeginDrawing();
            ClearBackground(RAYWHITE);
            DrawText("Hello, raylib!", 190, 200, 20, DARKGRAY);
        EndDrawing();
    }

    CloseWindow();
    return 0;
}
```

编译（Linux/macOS）：

```bash
gcc hello.c -lraylib -lGL -lm -lpthread -ldl -lrt -lX11 -o hello
# macOS 换成：
gcc hello.c -lraylib -framework OpenGL -framework Cocoa -framework IOKit -o hello
```

运行后窗口中央显示文字，ESC 或点关闭按钮退出。

### 案例 2：精灵动画 + 键盘输入（2D 像素游戏骨架）

```c
#include "raylib.h"

int main(void)
{
    InitWindow(640, 480, "Sprite Demo");
    SetTargetFPS(60);

    Texture2D spriteSheet = LoadTexture("character.png");
    // 假设 sprite 每帧 48x48，横排 8 帧
    int frameWidth  = 48;
    int frameCount  = 8;
    int currentFrame = 0;
    float frameTimer = 0.0f;
    float frameSpeed = 0.1f;  // 每 0.1 秒换一帧

    Vector2 pos = {320, 240};

    while (!WindowShouldClose())
    {
        // 更新
        float dt = GetFrameTime();
        frameTimer += dt;
        if (frameTimer >= frameSpeed) {
            currentFrame = (currentFrame + 1) % frameCount;
            frameTimer = 0.0f;
        }

        if (IsKeyDown(KEY_RIGHT)) pos.x += 150 * dt;
        if (IsKeyDown(KEY_LEFT))  pos.x -= 150 * dt;
        if (IsKeyDown(KEY_UP))    pos.y -= 150 * dt;
        if (IsKeyDown(KEY_DOWN))  pos.y += 150 * dt;

        // 绘制
        Rectangle srcRect = { (float)(currentFrame * frameWidth), 0,
                               (float)frameWidth, (float)spriteSheet.height };
        Rectangle dstRect = { pos.x, pos.y, frameWidth * 2.0f,
                               (float)spriteSheet.height * 2.0f };

        BeginDrawing();
            ClearBackground(BLACK);
            DrawTexturePro(spriteSheet, srcRect, dstRect,
                           (Vector2){0,0}, 0.0f, WHITE);
            DrawFPS(10, 10);
        EndDrawing();
    }

    UnloadTexture(spriteSheet);
    CloseWindow();
    return 0;
}
```

关键点：`DrawTexturePro` 允许指定源矩形（切哪一帧）和目标矩形（画在哪、放大多少），是精灵动画的标准接口。

### 案例 3：编译到 Web（HTML5 / WebAssembly）

同一份 C 代码可以用 Emscripten 编译成 WASM 跑在浏览器里，但游戏循环必须改写：

```c
#include "raylib.h"
#include <emscripten/emscripten.h>

void GameLoop(void)
{
    BeginDrawing();
        ClearBackground(RAYWHITE);
        DrawText("Running in Browser!", 120, 200, 20, DARKGRAY);
    EndDrawing();
}

int main(void)
{
    InitWindow(800, 450, "raylib Web");
    emscripten_set_main_loop(GameLoop, 0, 1);
    // CloseWindow() 不需要——浏览器关标签页就结束
    return 0;
}
```

编译命令：

```bash
emcc hello_web.c -o hello.html \
  -I/path/to/raylib/src \
  /path/to/raylib/src/web/libraylib.a \
  -s USE_GLFW=3 -s ASYNCIFY \
  --shell-file /path/to/raylib/src/shell.html
```

官方提供现成的 `shell.html` 模板，包含 canvas 和加载动画。编译成功后得到 `.html` + `.js` + `.wasm` 三件套，本地用 `python3 -m http.server` 起静态服务器就能访问（不能直接双击 .html，浏览器有跨域限制）。

## 踩过的坑

1. **屏幕不刷新，看起来像卡死**：`BeginDrawing()` / `EndDrawing()` 必须在 while 循环体内，放在循环外只画一帧，之后窗口冻住不动。新手最常见的错误。

2. **macOS 链接失败，报错信息莫名其妙**：静态链接需要 `-framework IOKit -framework Cocoa -framework OpenGL`，漏掉任意一个会出现 `_CGMainDisplayID referenced from...` 之类的符号找不到错误。用 `pkg-config --libs raylib` 省心。

3. **多线程调 Draw* 崩溃**：OpenGL 上下文绑定在主线程，任何 `DrawText`、`LoadTexture`、`GetTexture` 等涉及 GPU 的调用必须在主线程执行。想在子线程加载资源，只能先把文件读进内存（纯 CPU），再回主线程上传 GPU。

4. **Emscripten 构建用 while 循环阻塞浏览器**：浏览器的 JS 单线程模型不允许同步死循环，必须用 `emscripten_set_main_loop(GameLoop, 0, 1)` 替代 `while(!WindowShouldClose())`，否则 tab 无响应或直接崩溃。

5. **Android 构建需要 NDK r21+，r25 以上更稳**：官方模板在 `projects/Android` 目录，必须用 Gradle + NDK，直接 CMake 跨编译会因为找不到 Android 系统库而失败。

6. **加载大量纹理忘记 Unload 内存泄漏**：`LoadTexture` 每次都向 GPU 申请显存，不 `UnloadTexture` 会慢慢耗尽 VRAM。场景切换时记得 unload 上一场景的所有资源。

## 适用 vs 不适用

**适用**：

- 图形编程入门——从零学 2D/3D 渲染逻辑，raylib 的薄封装让你能看到每一步在做什么
- 快速原型——Game Jam、48 小时竞赛，一套 API 覆盖所有需求，不用研究框架配置
- 嵌入式 / 树莓派——支持 OpenGL ES，资源占用极低，适合跑在 ARM 板子上
- 教学工具——用 Python 绑定 `pyray` 给学生降低门槛，底层还是高性能 C

**不适用**：

- 大型商业游戏——没有资产管线、场景编辑器、物理引擎集成；上 Godot / Unity
- 复杂物理模拟——需要自行集成 Box2D / Bullet，raylib 只有基础碰撞检测
- Vulkan / Metal 渲染——raylib 默认走 OpenGL，要用下一代 API 需要换底层
- 需要热重载 / 可视化脚本的工作流——这些 raylib 都没有

## 学到什么

1. **帧循环是图形编程的心脏**：`while (!WindowShouldClose())` 里面：更新状态 → 清屏 → 绘制 → 呈现，这个四步模式在 OpenGL、Vulkan、Metal、WebGPU 里完全一样，学 raylib 等于建立了可迁移的直觉

2. **无外部依赖是一种设计哲学**：把依赖内嵌（而非用包管理器拉取）让库可以一次性 vendor 进项目，适合要求可重复构建的游戏和嵌入式场景；代价是库体积更大、更新依赖需要手动 merge

3. **API 命名即文档**：`BeginMode3D(camera)` / `EndMode3D()`、`BeginShaderMode(shader)` / `EndShaderMode()` 这种"成对动词"模式让状态机变得显式可读，代码即伪码

4. **同一份 C 代码可以跑在 8 个平台**：raylib 展示了 C99 + 条件编译 + 平台抽象层的威力；它的跨平台策略比"一次编写到处运行"更务实——同一套代码，各平台独立编译，平台差异封装在 core 模块内部

5. **语言绑定放大价值**：70+ 绑定意味着 Python / Rust / Go / Lua 程序员都能受益，核心用 C 写一次，生态用绑定层横向扩展，是开源库的经典扩散路径

## 延伸阅读

- 官方 GitHub 仓库：[raysan5/raylib](https://github.com/raysan5/raylib)（含 140+ 示例）
- 官方文档 Cheatsheet：[raylib.com/cheatsheet](https://www.raylib.com/cheatsheet/cheatsheet.html)
- 官方架构文档：[raylib architecture (Wiki)](https://github.com/raysan5/raylib/wiki/raylib-architecture)
- Python 绑定：[pyray / raylib-python-cffi](https://github.com/electronstudio/raylib-python-cffi)
- Rust 绑定：[raylib-rs](https://github.com/deltaphc/raylib-rs)
- Game Jam 模板：[raylib-game-template](https://github.com/raysan5/raylib-game-template)

## 关联

- [[kajiya-1986-rendering-equation]] —— 理解 raylib PBR 材质背后的光照方程
- [[3d-gaussian-splatting]] —— 与 raylib 同属图形渲染生态，代表神经辐射场渲染方向
- [[debevec-1998-rendering-with-natural-light]] —— 图形学基础文献，HDR / IBL 在 raylib models 模块中有简化实现
