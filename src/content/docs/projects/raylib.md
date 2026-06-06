---
title: raylib — 极简 C 游戏库，10 行代码跑起带窗口动画
来源: 'https://github.com/raysan5/raylib'
日期: 2026-06-06
分类: 图形学
子分类: 渲染与图形
难度: 初级
---

## 是什么

raylib 是一个用纯 C99 写成的游戏/图形库，让你只需 10 行代码就能打开一个窗口、画东西、播音效——不用提前搞懂 OpenGL 上下文、着色器编译或链接器玄学。

日常类比：raylib 就像乐高积木里的"基础入门套件"——每块积木（DrawText、DrawCircle、PlaySound）都是独立的小功能，你按说明书拼几块就能跑起来，不需要先自己造轮子。区别在于乐高拼完是静态的展示品，raylib 的每帧循环是动态更新的——每次屏幕刷新，你告诉它画什么，它就画什么。

在 raylib 之前，想做图形编程通常要先过三关：用 GLFW/SDL2 开窗口、写顶点缓冲对象初始化代码、配置 GLSL 着色器——光这些样板就能吓退初学者。raylib 把这三关全部内嵌到一个单头文件里，整个库只有约 1.8 万行 C 代码，所有第三方依赖（glfw、miniaudio、stb 系列）都已打包在 `src/external`，克隆仓库后直接 `gcc main.c -lraylib -lm` 就能跑。

## 为什么重要

不理解 raylib，下面这些事都没法解释：

- 为什么 C/C++ 游戏编程教程大多从 SDL2 开始——raylib 是比 SDL2 更薄的替代品，证明门槛可以更低
- 为什么"多平台"对 C 项目来说不再是噩梦——同一份源码在 Windows/Linux/macOS/Android/HTML5 上能无改动跑通
- 为什么 60 多种语言都有 raylib 绑定（Python pyray、Go raylib-go、Rust raylib-rs）——极简 C API 是"各语言 FFI 绑定的最小公约数"
- 为什么初学者用 raylib 写完第一个游戏后，再去学 OpenGL 会容易很多——先用黑盒理解"渲染循环"的概念，再拆开看实现

## 核心要点

1. **渲染循环是唯一的节奏**：raylib 程序的骨架永远是 `InitWindow → while(!WindowShouldClose()) { BeginDrawing ... EndDrawing } → CloseWindow`。类比：就像电影胶片——每帧都是独立的一张画，你在 BeginDrawing 和 EndDrawing 之间决定"这一帧画什么"。忘记这个结构，屏幕就永远只显示第一帧。

2. **7 个模块各自独立**：核心模块分 core（窗口、时钟、输入）/ shapes（几何图形）/ textures（图片与精灵）/ text（字体渲染）/ models（3D 网格）/ audio（音效）/ rlgl（OpenGL 抽象层）。类比：像瑞士军刀——每把刀刃都能单独用，不用全部展开。rlgl 是最底层的那把，可以直接调用来绕过高层封装。

3. **PascalCase 动词 API 是语义规范**：所有公开函数名遵循 `动词+名词` 规则（InitWindow、DrawText、LoadTexture、PlaySound），读函数名就知道它做了什么、在哪个生命周期调用。类比：像做菜食谱——先 Load（备料）、再 Draw/Play（烹调）、最后 Unload（洗锅）。Load 系列分配 GPU 资源，必须对应 Unload，否则内存泄漏。

## 实践案例

### 案例 1：10 行 Hello World——验证环境

最小可运行程序，确认安装无误：

```c
#include "raylib.h"

int main(void) {
    InitWindow(800, 450, "Hello raylib");   // 开窗口，宽 800 高 450
    SetTargetFPS(60);                       // 目标帧率 60fps

    while (!WindowShouldClose()) {          // 点关闭按钮或按 ESC 退出
        BeginDrawing();
        ClearBackground(RAYWHITE);          // 每帧先清成白色
        DrawText("Hello, World!", 190, 200, 20, LIGHTGRAY);  // 文字
        EndDrawing();
    }

    CloseWindow();
    return 0;
}
```

逐部分解释：

- `InitWindow(800, 450, "Hello raylib")` — 在 800×450 像素的地方开一个窗口，第三个参数是标题栏文字
- `SetTargetFPS(60)` — 告诉 raylib 每秒最多刷 60 帧（不设的话会跑满 CPU）
- `ClearBackground(RAYWHITE)` — 每帧开始先把画布涂成近白色；不写这行，上一帧的内容会残留
- `DrawText("Hello, World!", 190, 200, 20, LIGHTGRAY)` — 在坐标 (190, 200) 画字号 20 的浅灰色文字

编译命令（macOS/Linux）：`gcc main.c -lraylib -lm -o hello && ./hello`

### 案例 2：2D 精灵动画——角色移动

用图片实现一个可以用方向键控制的角色：

```c
#include "raylib.h"

int main(void) {
    InitWindow(800, 600, "2D Sprite");
    SetTargetFPS(60);

    // 读者需要准备一张精灵图（如 character.png），放到和可执行文件同目录
    Texture2D sprite = LoadTexture("character.png");

    Vector2 pos = { 400, 300 };   // 角色初始位置（屏幕中心）
    float speed = 200.0f;         // 每秒移动像素数

    while (!WindowShouldClose()) {
        float dt = GetFrameTime();  // 上一帧耗时（秒），用于帧率无关移动

        // 方向键控制
        if (IsKeyDown(KEY_RIGHT)) pos.x += speed * dt;
        if (IsKeyDown(KEY_LEFT))  pos.x -= speed * dt;
        if (IsKeyDown(KEY_DOWN))  pos.y += speed * dt;
        if (IsKeyDown(KEY_UP))    pos.y -= speed * dt;

        BeginDrawing();
        ClearBackground(DARKGRAY);
        DrawTextureV(sprite, pos, WHITE);  // 在 pos 处画精灵图
        EndDrawing();
    }

    UnloadTexture(sprite);  // 释放 GPU 纹理，与 LoadTexture 配对
    CloseWindow();
    return 0;
}
```

关键点：

- `GetFrameTime()` 返回上一帧的真实耗时（秒），乘以 speed 才能让移动速度与帧率无关——如果机器跑 30fps，每帧移动距离是 60fps 机器的 2 倍，最终速度相同
- `LoadTexture` 把图片上传到 GPU 显存；`UnloadTexture` 释放它——漏写会泄漏显存
- `DrawTextureV` 中的 `V` 代表用 Vector2 指定坐标，比 `DrawTexture(sprite, (int)pos.x, (int)pos.y, WHITE)` 更简洁

### 案例 3：编译到 Web（HTML5）——浏览器运行

同一份 C 代码，用 Emscripten 工具链输出 WebAssembly，让别人在浏览器里玩你的游戏：

```c
#include "raylib.h"

#ifdef PLATFORM_WEB
#include <emscripten/emscripten.h>
#endif

void GameLoop(void);  // 前向声明

int main(void) {
    InitWindow(800, 450, "Web Game");
    SetTargetFPS(60);

#ifdef PLATFORM_WEB
    // 浏览器不允许阻塞主线程，必须用回调式循环
    emscripten_set_main_loop(GameLoop, 0, 1);
#else
    while (!WindowShouldClose()) GameLoop();
#endif

    CloseWindow();
    return 0;
}

void GameLoop(void) {
    BeginDrawing();
    ClearBackground(RAYWHITE);
    DrawText("Running in browser!", 200, 200, 20, DARKBLUE);
    EndDrawing();
}
```

编译命令：

```bash
emcc main.c -o index.html \
  -I raylib/src \
  -L raylib/src/web -l raylib \
  -s USE_GLFW=3 -s ASYNCIFY \
  --shell-file raylib/src/minshell.html
```

这会生成 `index.html` + `index.js` + `index.wasm`，用任意 HTTP 服务器托管后即可在浏览器运行——与桌面版完全相同的逻辑。

## 踩过的坑

1. **BeginDrawing/EndDrawing 忘写进循环体**：如果把它们放在 `while` 外面，首帧渲染后屏幕不再刷新，看起来像卡死——实际上程序在正常运行，只是每帧没在绘制。

2. **macOS 静态链接漏传 Framework**：`gcc main.c -lraylib -lm` 在 macOS 上报链接错误，必须加 `-framework IOKit -framework Cocoa -framework OpenGL`；缺少任意一个的报错信息都不直接，容易让新人找半小时。

3. **多线程里调用 Draw\* 或 Load\*——OpenGL 上下文不共享**：raylib 所有涉及 GPU 的操作（DrawText、LoadTexture、PlaySound 等）必须在创建 OpenGL 上下文的**主线程**调用；在子线程调用会静默崩溃或产生 GL Error，原因是 OpenGL 上下文默认不跨线程共享。

4. **HTML5 用 while 阻塞主线程**：浏览器 JS 引擎是单线程的，用 `while(!WindowShouldClose())` 阻塞主线程会让页面卡死、标签页无响应；必须改成 `emscripten_set_main_loop` 把游戏循环改成由浏览器每帧调用的回调。

## 适用 vs 不适用场景

**适用**：

- 完全零基础入门图形/游戏编程——从 "Hello Window" 到第一个可玩游戏只需几百行
- 教学场景——课堂示例用 10-20 行就能演示物理模拟、碰撞检测等概念
- 原型快速验证——游戏玩法原型、算法可视化、工具开发
- 多平台发布——同一份代码跑 Windows/Linux/macOS/Web/Android，无需修改游戏逻辑

**不适用**：

- 生产级 AAA 游戏开发——缺乏场景编辑器、资产管线、大规模渲染优化（用 Unity/Godot）
- 需要高级渲染特性——PBR 材质管线、光线追踪、Vulkan/Metal 底层控制（用 bgfx 或直接写 API）
- 需要复杂 ECS 架构——raylib 没有实体组件系统，大型项目需要自行搭架构（用 [[bevy]]）
- 已有成熟 C++ 项目——如果团队已经在用 SDL2 + OpenGL，迁移成本高于收益

## 历史小故事（可跳过）

- **2013 年**：西班牙程序员 Ramon Sanchez（GitHub：raysan5）在 Bournemouth 大学任教时，发现学生进图形编程课第一关就被 GLUT/SDL2 的初始化代码劝退，决定自己写一个教学用库，发布 raylib 1.0。

- **2015-2018 年**：逐步加入音频（miniaudio）、物理（physac）、字体渲染（stb_truetype）模块；单头文件策略吸引了大量 C 爱好者，GitHub Star 从几百增长到 8000+。

- **2019 年**：加入 Raspberry Pi 和 Android 支持，同年首次出现社区维护的 60+ 语言绑定列表；raylib 从"教学库"变成了真实项目使用的库。

- **2023 年**：发布 5.0，引入 rlgl 软件渲染后端，正式支持在无 GPU 环境中纯 CPU 渲染；同年 GitHub Star 突破 22k，成为 C 生态里最受欢迎的游戏库之一。

- **设计哲学**：raysan5 至今坚持"单文件、零外部依赖、纯 C99"原则，拒绝引入 C++ 特性或复杂构建系统——这让 raylib 成为最容易被 AI 辅助初学者理解的图形库。

## 学到什么

1. **渲染循环是图形编程的核心抽象**——所有实时渲染系统（游戏引擎、浏览器渲染器、VR 运行时）底层都是"清屏→绘制→交换缓冲"的无限循环，raylib 把这个结构裸露给你，让你从第一行代码就理解它

2. **零依赖不是原则，是教育策略**——把所有第三方打包进去，消除"配环境"这一障碍，让学习者把精力放在概念理解而非工具链调试上

3. **API 命名是文档**——PascalCase 动词+名词的规范让你读函数名就能猜对用法，这是"零认知摩擦"设计的典型实现

4. **平台抽象不等于性能损失**——raylib 的 rlgl 层把 OpenGL 1.1/3.3/4.3/ES2/ES3 统一成同一套调用接口，桌面和 Web 共用一份代码，证明抽象层可以极薄

## 延伸阅读

- 官方文档与 Cheatsheet：[raylib.com/cheatsheet](https://www.raylib.com/cheatsheet/cheatsheet.html)（所有 API 一页总览，初学者必收藏）
- 官方 140+ 示例：[github.com/raysan5/raylib/tree/master/examples](https://github.com/raysan5/raylib/tree/master/examples)（按主题分类，每个不超过 100 行）
- Emscripten Web 构建指南：[raylib Web Builds](https://github.com/raysan5/raylib/wiki/Working-for-Web-(HTML5))（官方 Wiki，含 Makefile 模板）
- [[kajiya-1986-rendering-equation]] —— 理解"光是怎么在场景里传播的"理论基础
- [[3d-gaussian-splatting]] —— 基于点云的新型渲染方法，了解 raylib DrawModel 背后的渲染演进

## 关联

- [[bevy]] —— Rust 写的 ECS 游戏引擎；当 raylib 项目复杂度增长、需要实体组件系统时的下一站
- [[love2d]] —— Lua 版同类极简游戏库；API 设计哲学与 raylib 高度相似，适合对比学习
- [[kajiya-1986-rendering-equation]] —— 渲染方程是所有实时渲染的数学起点，raylib 的 DrawModel 最终基于此
- [[3d-gaussian-splatting]] —— 了解渲染技术的前沿演进，与 raylib 当前光栅化管线形成对比
- [[debevec-1998-rendering-with-natural-light]] —— 基于图像的光照（IBL）；raylib 5.0 的 PBR 材质功能以此为理论背景

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[debevec-1998-rendering-with-natural-light]] —— Debevec 1998 — 用真实世界的光照亮 CG 物体
- [[kajiya-1986-rendering-equation]] —— Kajiya 渲染方程 — 把所有渲染算法统一成一个积分方程

