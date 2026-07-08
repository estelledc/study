---
title: raylib — 极简 C 游戏库
来源: 'https://github.com/raysan5/raylib'
日期: 2026-07-08
分类: graphics
难度: 初级
---

## 是什么

raylib 是一个用 C 写的图形、多媒体和小游戏开发库，目标是让新手直接用代码打开窗口、画图、读输入、播声音。日常类比：它像一盒彩色马克笔和一张白纸，不像 Unity 或 Godot 那样先给你一整间工作室，你不会先拖组件、配面板，而是自己一笔一笔画出画面。

最小程序长这样：

```c
#include "raylib.h"

int main(void) {
    InitWindow(800, 450, "hello raylib");
    while (!WindowShouldClose()) {
        BeginDrawing();
        ClearBackground(RAYWHITE);
        DrawText("Hello", 360, 210, 30, DARKGRAY);
        EndDrawing();
    }
    CloseWindow();
    return 0;
}
```

这一小段已经包含游戏程序的骨架：初始化窗口、进入循环、每帧清屏和绘制、退出时释放窗口。

官方 README 把 raylib 定位成“简单、易用、享受游戏编程”的库；FAQ 也强调它更像 graphics library，而不是带编辑器、资源管理器和实体系统的完整游戏引擎。

## 为什么重要

不理解 raylib，下面这些事会很难解释：

- 为什么 C 这种“看起来很底层”的语言，也能用十几行代码做出窗口和图形反馈
- 为什么很多图形编程教程先讲 game loop，因为画面、输入和音频都要按帧推进
- 为什么入门做小游戏时，完整引擎反而可能太重，按钮太多会遮住底层概念
- 为什么跨平台图形库的难点不只是“画一个方块”，还包括窗口、OpenGL、音频、资源格式和构建方式

## 核心要点

raylib 的核心可以拆成三点：

1. **主循环是心跳**：程序不断执行“读输入 → 更新状态 → 重新绘制”。类比：动画翻页书，每一页都要重新画，连续翻起来才像在动。

2. **函数名尽量直给**：`InitWindow`、`DrawText`、`LoadTexture`、`PlayMusicStream` 读起来接近日常动作。类比：工具箱上直接写“锤子”“尺子”，新手不用先背一套抽象框架。

3. **给能力，不替你做架构**：raylib 提供窗口、输入、图形、音频、模型、shader 等模块，但不内置 GameObject、场景管理或资源管理器。类比：它给你厨房器具，不规定菜单和餐厅流程。

这也是它和大型引擎的差异：大型引擎把很多决策提前包装好，raylib 则让你在代码里看见每一步。

## 实践案例

### 案例 1：打开窗口并画文字

官方 README 的 basic window 示例展示了 raylib 最小工作流：

```c
InitWindow(800, 450, "basic window");

while (!WindowShouldClose()) {
    BeginDrawing();
    ClearBackground(RAYWHITE);
    DrawText("first window", 190, 200, 20, LIGHTGRAY);
    EndDrawing();
}

CloseWindow();
```

逐部分解释：

- `InitWindow` 创建窗口和背后的图形上下文，相当于先把画布支起来
- `WindowShouldClose` 检查用户是否点关闭按钮或按退出键，决定循环是否继续
- `BeginDrawing` 和 `EndDrawing` 包住一帧绘制，告诉 raylib “这一页从这里开始、到这里结束”
- `ClearBackground` 每帧清空旧画面，否则上一帧留下的东西会像残影一样叠在屏幕上

### 案例 2：让 2D 摄像机跟着玩家

官方 `core_2d_camera.c` 示例把“世界坐标”和“屏幕坐标”分开：

```c
Rectangle player = { 400, 280, 40, 40 };
Camera2D camera = { 0 };
camera.target = (Vector2){ player.x + 20, player.y + 20 };
camera.offset = (Vector2){ screenWidth/2.0f, screenHeight/2.0f };
camera.zoom = 1.0f;

if (IsKeyDown(KEY_RIGHT)) player.x += 2;
if (IsKeyDown(KEY_LEFT)) player.x -= 2;
camera.target = (Vector2){ player.x + 20, player.y + 20 };

BeginMode2D(camera);
DrawRectangleRec(player, RED);
EndMode2D();
```

逐部分解释：

- `player` 是世界里的角色，坐标可以比屏幕大很多
- `Camera2D` 像拿着手机拍场景，`target` 决定镜头盯哪里，`offset` 决定目标显示在屏幕哪里
- `IsKeyDown` 每帧读取键盘，所以按住右方向键时角色会连续移动
- `BeginMode2D(camera)` 之后画出的对象会经过摄像机变换，新手不用自己写矩阵计算

### 案例 3：播放背景音乐并每帧更新

官方 `audio_music_stream.c` 示例说明音频流也要进入主循环：

```c
InitAudioDevice();
Music music = LoadMusicStream("resources/country.mp3");
PlayMusicStream(music);

while (!WindowShouldClose()) {
    UpdateMusicStream(music);
    if (IsKeyPressed(KEY_P)) PauseMusicStream(music);

    BeginDrawing();
    DrawText("music is playing", 250, 180, 20, DARKGRAY);
    EndDrawing();
}

UnloadMusicStream(music);
CloseAudioDevice();
```

逐部分解释：

- `InitAudioDevice` 先打开音频设备，类似先把音箱接上电
- `LoadMusicStream` 适合较长音乐，不必一次性把整首歌都塞进内存
- `UpdateMusicStream` 必须每帧调用，否则流式音频可能没有持续喂数据
- `UnloadMusicStream` 和 `CloseAudioDevice` 是收尾动作，防止资源被程序一直占着

## 踩过的坑

1. **把 raylib 当完整引擎**：它没有内置场景树、实体组件和资源管理器，因为它刻意保留低层控制权。

2. **忘记每帧更新流式资源**：音乐流、动画状态、摄像机跟随都依赖主循环，少一步就会表现得像“卡住”。

3. **加载资源后不释放**：纹理、音乐、模型等通常要配对 `Unload...`，否则小 demo 没事，长时间运行就会浪费内存。

4. **只看 cheatsheet 不跑 examples**：官方自己也把 examples 当主要学习入口，因为函数列表告诉你“有什么”，示例才告诉你“怎么组合”。

## 适用 vs 不适用场景

**适用**：

- 零基础学习图形编程、游戏循环、键盘鼠标输入和音频播放
- 课程 demo、game jam、小型 2D 游戏、简单 3D 原型和互动工具
- 想理解引擎底层概念，而不是一开始就被编辑器和资产流水线包起来
- 需要从 C 代码跨到桌面、WebAssembly、Raspberry Pi 或嵌入式显示设备的项目

**不适用**：

- 大型商业项目，需要成熟编辑器、可视化场景管理、资源管线和团队协作权限
- 复杂物理、网络同步、脚本热更新、动画状态机都希望开箱即用的项目
- 完全不想写 C 或 C-like 代码，只想通过拖拽搭建玩法的学习路径
- 追求 Vulkan、Metal、DirectX 12 等现代底层图形 API 的实验

## 历史小故事（可跳过）

- **2006 年前后**：作者 Ramon Santamaria 开始做游戏，后来给艺术背景学生教游戏开发，发现初学者需要更清楚的函数名和更少的框架噪音。
- **2013 年 11 月**：raylib 1.0 发布，最初目标就是“主要用于学习游戏编程”的 C 库。
- **2014 年**：raylib 1.1 加入 `rlgl`，把 OpenGL 1.1、3.3 和 ES 2.0 差异包到同一层里。
- **2015-2016 年**：摄像机、shader、raygui、音频、2D 物理和更多平台陆续加入，但主线仍是保持简单。
- **现在**：GitHub 上已有三万多 stars，README 记录了 140 多个官方示例和 70 多种语言绑定，社区把它用在游戏、工具、教学和嵌入式显示里。

## 学到什么

- raylib 的价值不是“功能最多”，而是让图形程序的关键部件直接暴露给新手看。
- game loop 是入门游戏开发的第一块地基：没有它，输入、动画、绘制和音频都串不起来。
- 小型库和完整引擎不是高低关系，而是控制权位置不同：raylib 更靠近代码，Godot/Unity 更靠近编辑器。
- 好的教学工具会主动少做一点，把学习者真正需要理解的机制留在视野里。

## 延伸阅读

- 官方仓库：[raysan5/raylib](https://github.com/raysan5/raylib)
- 官方示例集合：[raylib examples](https://github.com/raysan5/raylib/tree/master/examples)
- 官方 FAQ：[Frequently Asked Questions](https://github.com/raysan5/raylib/blob/master/FAQ.md)
- 函数速查：[raylib cheatsheet](https://www.raylib.com/cheatsheet/cheatsheet.html)
- [[bevy]] —— 另一个游戏开发入口，但它走 Rust ECS 和现代引擎路线

## 关联

- [[bevy]] —— 和 raylib 都能做游戏，但 bevy 更像完整数据驱动引擎
- [[defold]] —— 同样面向游戏开发，差异在于 Defold 提供编辑器和资源工作流
- [[godot]] —— 大型开源游戏引擎，对比 raylib 可以看出“库”和“引擎”的边界
- [[ffmpeg]] —— 都处理多媒体，但 FFmpeg 关注编码转码，raylib 关注实时展示和交互
- [[blender]] —— Blender 负责建模和资产制作，raylib 可以加载模型并实时渲染
- [[micropython]] —— 都适合教学场景：一个教硬件脚本，一个教图形程序的主循环

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
