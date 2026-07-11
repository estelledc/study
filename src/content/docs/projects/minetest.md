---
title: Minetest (Luanti) — 开源世界的 Minecraft
来源: 'https://github.com/luanti-org/luanti'
日期: 2026-06-24
分类: 图形
难度: 初级
---

## 是什么

Minetest（2024 年正式更名为 Luanti）是一个用 C++ 写的开源体素游戏引擎，由芬兰程序员 Perttu Ahola 于 2010 年创建。日常类比：把它想象成一个"空白乐高工厂"——工厂本身提供地基、墙壁、电力系统（渲染、物理、网络），但工厂里生产什么产品、产品长什么样、怎么玩，全部由工人用 Lua 脚本自己定义。这和 Minecraft 不同——Minecraft 是一个成品游戏，而 Luanti 是一个造游戏的平台。

更准确地说，Luanti 的定位是"体素游戏引擎 + Lua mod 系统"。引擎负责方块世界的生成、渲染、网络同步，而游戏规则、方块类型、合成配方、UI 界面等全部通过 Lua 编写的 Mod 来定义。官方附带一个默认游戏"Minetest Game"，但社区还有上百个完全不同的游戏，从生存冒险到城市建设到教育工具都有。

## 为什么重要

不理解 Luanti 的设计，下面这些事都没法解释：

- 为什么一个体素引擎要把"引擎"和"游戏内容"彻底分离——答案是可扩展性。引擎只管底层能力，具体玩法完全交给 mod 作者，一个引擎能跑出几百种不同游戏
- 为什么选 C++ 做引擎核心 + Lua 做脚本层——C++ 给性能（渲染、网络、世界生成），Lua 给灵活性（mod 开发门槛低，运行时可热加载）
- 为什么体素游戏的世界看似无限却不会撑爆内存——MapBlock 分块加载 + 按需生成 + mono-block 压缩
- 为什么客户端-服务器架构对多人游戏至关重要——服务器是权威端，客户端做预测和渲染，防作弊的根基
- 为什么开源替代品能在 Minecraft 垄断的领域活下来——零成本、完全自由定制、教育友好、跨平台（含 Android）

## 核心要点

Luanti 的架构可以拆成四层来理解：

**1. 体素存储（数据怎么放）**

世界由方块（voxel/node）组成，每个方块只有 4 字节——2 字节记类型（石头/泥土/空气），1 字节记光照，1 字节记朝向等附加信息。16x16x16 个方块打包成一个 MapBlock（类比：一箱乐高），多个 MapBlock 按垂直列组成 MapSector，所有 MapSector 组成整个 Map。玩家走到哪里，引擎才生成和加载那附近的 MapBlock，走远了就卸载。如果一个 MapBlock 里 4096 个方块全一样（比如全是空气），引擎只存一个方块的数据，叫 mono-block 优化。

**2. 客户端-服务器架构（谁说了算）**

即使是单机游戏，Luanti 内部也跑着一个本地服务器。服务器是"裁判"——所有方块修改、物品操作、实体逻辑都由服务器计算和校验。客户端负责渲染画面、处理输入、做预测（比如你按方向键立刻移动，不用等服务器确认）。多人联机时，所有客户端连同一个服务器，服务器保证所有人看到的世界一致。

**3. Lua 脚本层（怎么定义玩法）**

引擎通过 C++ 和 Lua 的绑定层暴露 API。Mod 作者用 Lua 注册方块（`minetest.register_node`）、注册合成配方、注册实体行为、定义 UI 界面。引擎启动时加载所有 Mod 的 Lua 文件，运行时由 `ServerScripting` 模块管理脚本调用。安全方面，客户端 Lua（CSM）被沙箱限制，不能做危险操作。

**4. 渲染和游戏循环（怎么画出来）**

客户端每帧做三件事：处理网络包更新世界状态、把 MapBlock 转成可渲染的 mesh（网格）、用 OpenGL/Irrlicht 引擎画到屏幕上。MapBlock 到 mesh 的转换由专门的 `MeshUpdateManager` 线程异步完成，不卡主线程。

## 实践案例

### 案例 1：写一个最简单的 Mod——注册一个自定义方块

```lua
-- mods/mymod/init.lua
-- 注册一个叫"发光石"的新方块
minetest.register_node("mymod:glowstone", {
    description = "发光石",                -- 鼠标悬停显示的名字
    tiles = {"mymod_glowstone.png"},       -- 六个面用同一张贴图
    light_source = 14,                     -- 最大亮度 14（满值）
    groups = {cracky = 3},                 -- 可用镐挖，硬度 3
})
```

关键点：一个 Lua 文件、一张贴图、几行代码就能往游戏里加一个全新方块。这就是引擎和内容分离的威力——你不需要碰 C++ 代码。

### 案例 2：理解 MapBlock 的内存节省

```
一个 MapBlock = 16 x 16 x 16 = 4096 个方块
每个方块 4 字节 → 一个 MapBlock 占 16 KB
如果全是空气（mono-block）→ 只占 4 字节

假设玩家视野内有 1000 个 MapBlock：
  全量存储：1000 x 16 KB = 16 MB
  假设 60% 是纯空气 mono-block：
  400 x 16 KB + 600 x 4 B = 6.4 MB + 2.4 KB ≈ 6.4 MB
  节省了 60%
```

### 案例 3：下载预编译包或从源码跑起来

**逐步解释**：

1. **最快体验**：去 [luanti.org](https://www.luanti.org/) 下载对应平台安装包（Windows / macOS / Linux / Android），解压即可运行，不必先编译。
2. **装一个游戏包**：启动后在主菜单 Content 里安装 Mineclonia 或 VoxeLibre，再回 Start Game 创建新世界。
3. **从源码编译（学引擎）**：需要 C++17、CMake、IrrlichtMt、LuaJIT、SQLite3 等；基本流程是 `cmake -B build && cmake --build build`，细节见仓库 `doc/compiling/`。
4. **写 Mod**：在游戏目录建 `mods/mymod/init.lua`，引擎启动会自动加载；改 Lua 后重启游戏即可，不必重编引擎。

## 踩过的坑

1. **把 Luanti 当成"开源 Minecraft"来理解**：这是最常见的误解。Minecraft 是一个游戏，Luanti 是一个引擎。Luanti 自带的 Minetest Game 确实像 Minecraft，但引擎本身可以做完全不同类型的体素游戏。类比：Chrome 是浏览器，不是某个网站。

2. **以为 Mod 可以随便混装**：不同 Mod 之间可能有 API 冲突或依赖顺序问题。Luanti 的 Mod 系统有 `depends.txt`（或 `mod.conf` 里的 `depends`）来声明依赖关系，引擎按依赖顺序加载。不写依赖声明就混装多个 Mod，容易出现"未定义节点"之类的运行时错误。

3. **混淆客户端 Mod 和服务端 Mod**：服务端 Mod（SSM）能访问完整 API，客户端 Mod（CSM）被沙箱限制，不能修改世界、不能注册方块。新手常问"为什么我的 CSM 注册方块不生效"——因为注册方块是服务端的事。

4. **忽略 MapBlock 边界问题**：光照和液体流动需要读取相邻 MapBlock 的数据。如果相邻 MapBlock 还没加载，光照计算就会出错，表现为方块边界出现黑缝。引擎内部用 `m_lighting_complete` 标志来追踪这个问题，但 Mod 作者如果用 VoxelManip 做批量操作时忘了调 `calc_lighting`，就会踩到这个坑。

## 适用 vs 不适用场景

**适用**：

- 学习体素引擎架构——C++ 代码量适中（~10 万行），架构清晰，有完整文档，比 Minecraft 源码（不开源）好学得多
- 教育和创客场景——完全免费，支持 Android，学校和编程社团用来教 Lua 编程的真实项目
- 想做自己的体素游戏——引擎 + Lua API 足够灵活，从零做一个全新玩法的游戏比在 Minecraft 上做 Mod 自由度更高
- 需要自托管多人服务器——零授权费，服务器性能要求低，树莓派都能跑

**不适用**：

- 追求 3A 画质——Luanti 的渲染管线基于 Irrlicht（现已分叉维护），不支持光线追踪、PBR 材质等现代特性
- 需要大量现成内容——Minecraft 的 mod 和社区内容量级远超 Luanti
- 做非体素类型的游戏——引擎设计深度绑定体素世界，拿它做 2D 平台跳跃或 3D 射击不合适
- 需要稳定的商业 API——引擎 API 在不同版本间有 breaking change，商业项目要考虑维护成本

## 历史小故事（可跳过）

- **2010 年**：芬兰程序员 Perttu Ahola（celeron55）以 Minetest-c55 起步，最初目标接近「Minecraft 克隆实验」。
- **之后多年**：去掉 -c55 后缀，以 Minetest 之名成长为「引擎 + Lua mod」平台；社区游戏远不止默认的 Minetest Game。
- **2024-10-13**：官方宣布引擎更名为 **Luanti**（芬兰语 luonti「创造」+ Lua），仓库迁到 `luanti-org/luanti`，旧 `minetest/minetest` 链接 301 跳转。
- **今天**：ContentDB 上仍能看到 Minetest Game、VoxeLibre、Mineclonia 等；名字在换，体素引擎 + Lua 内容层的分工没变。

## 学到什么

1. **引擎和内容分离是可扩展性的根基**——Luanti 证明了一个小团队维护引擎、社区贡献内容的模式是可行的。这个思路在浏览器（引擎）和网页（内容）、操作系统（内核）和应用（内容）中都有体现。

2. **4 字节存一个方块是极致的数据压缩设计**——MapNode 用 2+1+1 字节编码类型、光照、附加数据，再加上 mono-block 优化，让无限世界在有限内存中成为可能。这种"先想清楚数据结构再写代码"的思路比先跑通再优化靠谱得多。

3. **客户端-服务器分离即使在单机游戏中也有意义**——Luanti 的单机模式本质是本地服务器 + 本地客户端。这种设计让单机和多人共享同一套逻辑代码，避免了"单机能跑但联机出 bug"的经典问题。

4. **Lua 嵌入式脚本的 trade-off**——Lua 快速上手、运行时加载，但缺乏类型检查，大型 Mod 容易出现拼写错误导致的 nil 引用。如果要做更大规模的 Mod 生态，可能需要 TypeScript 那样的类型层。

## 目录结构

```
luanti/
├── src/                    # C++ 引擎核心
│   ├── client/             # 客户端：渲染、输入、mesh 生成
│   ├── server.cpp/h        # 服务器主循环
│   ├── mapblock.cpp/h      # MapBlock 数据结构
│   ├── mapnode.cpp/h       # MapNode（单个方块）4 字节结构
│   ├── map.cpp/h           # Map 容器，管理所有 MapSector/MapBlock
│   ├── network/            # 网络协议、包处理
│   ├── script/             # Lua 绑定层
│   │   └── lua_api/        # 暴露给 Mod 的 C++ → Lua API
│   └── emerge.cpp          # 地图生成管理器
├── builtin/                # 内置 Lua 脚本（核心游戏逻辑）
│   ├── game/               # 游戏模式的基础功能
│   └── common/             # 客户端/服务器共用的 Lua 工具
├── doc/                    # 文档
│   ├── lua_api.md          # Lua API 完整参考（Mod 开发必读）
│   └── compiling/          # 编译指南
├── games/                  # 游戏包（引擎自带或社区贡献）
└── mods/                   # Mod 目录（用户自己安装的 Mod）
```

## 延伸阅读

- 官方网站：[Luanti.org](https://www.luanti.org/) ——下载、游戏列表、Mod 仓库入口
- 官方仓库：[luanti-org/luanti](https://github.com/luanti-org/luanti) ——引擎源码（旧 minetest/minetest 会重定向到这里）
- Lua API 参考：[doc/lua_api.md](https://github.com/luanti-org/luanti/blob/master/doc/lua_api.md) ——写 Mod 的完整 API 文档
- 架构全景：[DeepWiki - Luanti Overview](https://deepwiki.com/luanti-org/luanti/1-overview) ——代码级架构讲解
- 社区 Mod 仓库：[ContentDB](https://content.luanti.org/) ——浏览安装 Mod、游戏、材质包
- 更名公告：[Introducing Our New Name](https://blog.luanti.org/2024/10/13/Introducing-Our-New-Name/) ——2024-10 Luanti 命名说明

## 关联

- [[bevy]] —— 同为游戏引擎，对比 ECS 架构（Bevy）vs 传统客户端-服务器架构（Luanti）
- [[cocos2d-x]] —— C++ 游戏引擎，对比 2D 引擎和 3D 体素引擎的设计差异
- [[panda3d]] —— Python/C++ 3D 引擎，同样用脚本语言做上层逻辑，对比嵌入 Lua vs 嵌入 Python
- [[ffmpeg]] —— 同为 C/C++ 大型开源项目，展示"核心引擎 + 插件架构"的通用模式
- [[sqlite]] —— 嵌入式数据库，Luanti 用 SQLite 存储地图数据，理解 Luanti 的持久化层需要了解 SQLite

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[love2d]] —— LÖVE — 用 Lua 写 2D 游戏的轻量框架
- [[openrct2]] —— OpenRCT2 — 用逆向工程让 20 年前的游戏复活
