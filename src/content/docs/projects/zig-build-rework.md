---
title: Zig Build System Reworked — 配置与执行分离的两段式构建
description: Zig 0.17 将 build.zig 配置阶段与构建图执行拆成 configurer/maker 双进程，缓存序列化构建图并显著降低 zig build 开销
来源: 'https://ziglang.org/learn/build-system/'
日期: 2026-06-13
子分类: 类型与 PL 理论
分类: 编程语言
难度: 中级
provenance: pipeline-v3
---

## 日常类比：装修图纸与施工队分开

想象你要装修一套房子。老办法是：每次改一个开关位置，建筑师和施工队绑在同一辆面包车里出发——车又大又慢，而且只要改图纸，整辆车（含施工设备）都得重新发动一次。

**Zig Build System Reworked**（2026 年 5 月由 Andrew Kelley 合入 master，随 Zig 0.17 发布）把这件事拆成两段：

1. **Configurer（配置员）**：读你的 `build.zig`，在 debug 模式下画出「施工图纸」——也就是构建图（build graph），然后把它**序列化**成二进制配置文件，交给父进程缓存。
2. **Maker（施工队）**：读这份缓存图纸，用 **release 优化**后的独立进程真正编译、链接、跑测试。Maker 按 Zig 版本全局缓存，不必每个项目各编一份。

你只改业务代码、没动 `build.zig` 时，Configurer 可以整段跳过；只改运行参数（比如 `zig build run -- --verbose`）时，图纸不用重画，Maker 在执行阶段吃掉透传参数即可。官方 benchmark 里，`zig build --help` 墙钟时间从约 **150ms 降到 14.3ms**（约 90%），CPU 周期减少约 96%——说明「重复付配置税」这条路径被砍掉了。

这和 [[zig]] 语言「用 Zig 写构建脚本、不搞第二套 DSL」的哲学一致：变的是**怎么运行** `build.zig`，不是让你去学 CMake。

## 是什么

Zig 的构建系统把项目建模为**有向无环图（DAG）**：节点是 Step（编译、安装、跑测试、调外部工具等），边是依赖。用户入口是仓库根目录的 `build.zig`；若声明依赖，还有伴生清单 `build.zig.zon`（Zig Object Notation，`.zon` 扩展名）。

**Rework 之前**：`build.zig` 与构建系统实现被打包进**同一个 debug 构建 runner**，一次 `zig build` 既要执行用户脚本，又要跑完整张图。构建系统功能越多，这个合体进程越臃肿，每次动 `build.zig` 都要连带重编大块标准库构建代码。

**Rework 之后**：

| 角色 | 做什么 | 编译模式 | 缓存粒度 |
|------|--------|----------|----------|
| Configurer | 执行 `build.zig`，产出序列化配置 | debug（迭代快） | 按项目 + 输入哈希 |
| Maker | 读配置，执行 Step | release（执行快） | 按 Zig 版本全局 |
| 父进程 `zig build` | 调度、缓存配置、选 Step | — | `.zig-cache/c/` 等 |

序列化产物可通过 `zig build --print-configuration` 以 **ZON 文本**查看；工具链作者更推荐直接 mmap 二进制格式，用 `std.Build.Configuration` 加载——ZLS（Zig 语言服务器）等 IDE 集成不必再 fork 构建 runner 去「猜」项目结构。

## 为什么重要

1. **开发者内循环**：`--watch`、`--fuzz`、频繁 `zig build test` 时，配置阶段不能成为固定税。Configurer 变小 + 配置可缓存，让「改一行源码 → 重编」路径更干净。
2. **可编程构建的边界更清晰**：构建脚本仍是 Turing 完备的 Zig，但**图构造（configure）**与**图执行（make）**分离后，哪些输入该让图失效、哪些只影响运行，有了硬规则——减少「改个 flag 却触发整图重算」的意外。
3. **工具生态**：构建图变成可传递的 artifact，第三方工具（包索引、IDE、Nix 式包装生成器）可以**不执行**不可信 `build.zig` 就读到声明式依赖（`build.zig.zon`）或已配置图（序列化配置）。
4. **与包管理协同**：`build.zig.zon` 里 `hash` 是依赖的**真源**（内容寻址），`url` 只是镜像；`zig build --fetch` 可预拉依赖树。Rework 让「先 fetch 声明式元数据、再 configure、再 make」的流水线更线性。

## 核心概念

### 1. Configure / Make 两阶段

- **Configure**：运行 `pub fn build(b: *std.Build) void`，注册 executable、test、install、run step 等。此阶段应只决定「图长什么样」。
- **Make**：根据缓存的配置执行 Step（调编译器、链接器、子进程）。只影响执行、不影响图形状的 CLI 行为应落在这里。

典型例子：`-freference-trace` 这类只影响诊断输出的 flag，在新架构下不必为了它重跑 `build.zig`。

### 2. 序列化构建图（Configuration）

Configurer 输出二进制配置（项目缓存在 `.zig-cache/c/` 一类路径下）。含义：

- 同一份图可被 Maker 多次消费；
- 工具可用 `std.Build.Configuration` 只读解析，无需重新实现 build runner；
- 人可读调试：`zig build --print-configuration` 导出 ZON。

Zig 有意**减少**对 JSON 等非核心格式的编译器内建支持，倾向 ZON 或自家二进制——写 Zig 的工具直接用标准库 API 即可。

### 3. `build.zig.zon` 与内容哈希

`build.zig.zon` 是 `build.zig` 的**声明式附录**（包名、版本、依赖 URL/hash/path、`paths` 包含规则等）。要点：

- **`hash`**：对包内文件（经 `paths` 过滤后）算出的指纹；包由 hash 标识，不由 URL 标识。
- **`path`**：本地路径依赖，与 `url` 互斥，不算 hash。
- **`paths`**：哪些文件算进包（空字符串 `""` 表示构建根目录本身）。

这让镜像、离线缓存、`file://` 协议与可重现构建站在同一套模型上。

### 4. 透传参数：`b.args` → `addPassthruArgs()`

0.17 的**主要破坏性迁移点**：Configure 进程**看不到**父进程的 `b.args`。若你在 configure 里读透传参数来决定图结构，必须改成显式 `b.option` / `b.step` 选项；若只是转给 `zig build run -- --flag`，改用：

```zig
run_cmd.addPassthruArgs();
```

参数在 **Make 阶段**注入，不改变已缓存的图——这是性能与语义双赢，也是迁移时最常搜的关键词。

### 5. 与旧 API 的其它触碰点

Rework 伴随一轮 `std.Build` 清理（0.17 dev 分支上可见）：

- `b.build_root` → `b.root` 等命名统一；
- `FmtStep` 等路径参数向 `LazyPath` 列表迁移；
- 自定义 `Step.makeFn` 式步骤早已不推荐，**Run Step** 仍是扩展外部命令的正道。

官方口径是「API 层面大体非破坏」，但「聪明」的 `build.zig` 值得在 master 上提前跑一遍。

## 代码示例

### 示例 1：最小 `build.zig` + `build.zig.zon`（可缓存配置）

`build.zig`——只声明一个可执行文件并安装：

```zig
const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const exe = b.addExecutable(.{
        .name = "demo",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });

    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());

    if (b.args) |args| {
        _ = args; // 0.17：不要在 configure 里读 b.args
    }
    run_cmd.addPassthruArgs(); // 0.17：透传 zig build run -- 之后的参数

    const run_step = b.step("run", "Run the app");
    run_step.dependOn(&run_cmd.step);
}
```

`build.zig.zon`——声明包身份与（可选）远程依赖：

```zon
.{
    .name = .demo,
    .version = "0.1.0",
    .fingerprint = 0x0, // 首次可用 zig fetch 生成正式 fingerprint
    .minimum_zig_version = "0.17.0",
    .dependencies = .{
        // .@"my-dep" = .{
        //     .url = "https://example.com/my-dep.tar.gz",
        //     .hash = "1220abcd...", // 内容哈希，非 URL
        // },
    },
    .paths = .{
        "build.zig",
        "build.zig.zon",
        "src",
    },
}
```

常用命令：

```bash
zig build --fetch          # 按 zon 拉依赖后退出
zig build                  # configure（若需）+ make
zig build run -- --verbose # --verbose 在 make 阶段透传，不重画配置图
zig build --print-configuration  # 调试：导出 ZON 格式构建配置
```

### 示例 2：依赖本地 path 与远程 hash 包

`build.zig` 里添加依赖模块：

```zig
const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // 由 build.zig.zon 解析；path 依赖指向 ../shared-lib
    const shared = b.dependency("shared", .{
        .target = target,
        .optimize = optimize,
    });

    const mod = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
        .imports = &.{
            .{ .name = "shared", .module = shared.module("shared") },
        },
    });

    const exe = b.addExecutable(.{ .name = "app", .root_module = mod });
    b.installArtifact(exe);
}
```

`build.zig.zon` 片段——**path** 与 **url+hash** 二选一：

```zon
.{
    .name = .app,
    .version = "0.1.0",
    .dependencies = .{
        .shared = .{
            .path = "../shared-lib", // 本地开发：不算 hash
        },
        .@"zig-json" = .{
            .url = "https://codeberg.org/zig-json/zig-json/archive/master.tar.gz",
            .hash = "1220...", // 必须匹配 paths 过滤后的内容
        },
    },
    .paths = .{ "build.zig", "build.zig.zon", "src" },
}
```

设计意图：`url` 可换镜像，**`hash` 不变则包不变**；CI 与同事机器得到相同比特，而不依赖「某个 git 服务器今天是否在线」。

## 工作流程（新架构）

```text
zig build [flags]
    │
    ├─► 配置缓存命中？ ──是──► 跳过 Configurer
    │         │
    │        否
    │         ▼
    │    Configurer (debug)
    │    执行 build.zig → 写二进制 Configuration
    │
    ▼
Maker (release, 全局缓存)
    读 Configuration → 按 DAG 执行 Step（编译/链接/测试/…）
```

与包管理：

```text
build.zig.zon (声明依赖 hash/url/path)
        │
        ▼
zig build --fetch  →  并行 Fetch 任务拉取并校验 hash
        │
        ▼
configure 阶段把依赖图缝进 import / module 表
```

## 迁移清单（面向 0.17）

1. 全文搜索 `b.args`：仅转发给 run step → `addPassthruArgs()`；用于决定 target/特性 → 改为 `b.option` 或独立 step。
2. 在 master/dev 上跑 `zig build` 全矩阵（debug/release/cross），关注 `std.Build` 重命名。
3. 更新 `build.zig.zon` 的 `fingerprint` 与 `minimum_zig_version`（0.17 对 fingerprint 计算规则有调整）。
4. IDE/脚本若解析构建信息：优先 `zig build --print-configuration` 或 `std.Build.Configuration`，避免解析 `.zig-cache` 内部文件名（尚无稳定「打印路径」flag 时）。
5. 自定义构建步骤：避免依赖已弃用的 `makeFn`；用 `addSystemCommand` / `addRunArtifact` 等 Run Step 组合。

## 与其它系统对照

| 维度 | Zig Rework | CMake | Cargo |
|------|------------|-------|-------|
| 构建描述语言 | Zig（`build.zig`） | CMake DSL | TOML + build.rs |
| 声明式锁文件 | `build.zig.zon` | 无一等 | `Cargo.lock` |
| 配置/执行分离 | Configurer / Maker 进程 | configure + generate 两阶段 | metadata 与编译单元划分不同 |
| 图的可序列化 | 二进制 Configuration + ZON 导出 | 生成器文件 | `cargo metadata` JSON |

Zig 的选择是：**可编程**（build.zig）与**可声明**（build.zig.zon）并存，再把「跑脚本」的成本通过缓存和进程拆分压下去。

## 常见误区

- **误区**：「所有构建都会快 10 倍。」**事实**：大头是避免重复 configure；纯编译瓶颈仍在 LLVM/链接器。`zig build --help` 极快是因为几乎只做缓存读取。
- **误区**：「`b.args` 只是改名。」**事实**：configure 阶段故意不可见透传参数；用参数改图结构必须显式建模。
- **误区**：「没有 `build.zig.zon` 就不能用依赖。」**事实**：zon 是包管理与可重现 fetch 的入口；纯本地 monorepo 可以只有 `build.zig`。
- **误区**：「工具必须解析二进制格式。」**事实**：人类用 `--print-configuration`；程序用 `std.Build.Configuration` 或自编译小助手读二进制。

## 延伸话题

- **ZLS / IDE**：序列化图减少「语言服务器 fork build runner」的需求，与 [[zig]] 工具链深度集成仍在演进。
- **Nix / 发行版打包**：声明式 `build.zig.zon` + 可导出配置，利于生成下游包装而不执行任意 Zig 代码。
- **编译器服务器**：社区讨论 `--listen`、结构化诊断等，与本次 rework 同属「构建即平台」方向。
- **0.17 其它内容**：LLVM 22 升级等；相对 0.16 长周期，0.17 范围更集中，发布节奏更快。

## 小结

Zig Build System Reworked 不是给 `zig build` 打补丁，而是重新定义边界：**Configurer 画图纸、Maker 施工、父进程缓存图纸**。带来的直接收益是配置路径大幅变快；长期收益是构建图成为工具链的一等公民，并与 `build.zig.zon` 的内容寻址包管理同一套叙事。

若你正在维护 Zig 项目，在 0.17 稳定前用 master 试一次构建，并改掉 `b.args` 透传——往往就是一次 `addPassthruArgs()` 的事。若你在评估 Zig 做系统软件，这次 rework 说明：**可编程构建脚本**不必永远付出「每次启动都重跑 debug 巨进程」的代价。

## 参考

- [Zig Build System（官方教程）](https://ziglang.org/learn/build-system/)
- [Devlog：Build System Reworked（Ziggit 讨论）](https://ziggit.dev/t/devlog-build-system-reworked/15742)
- [build.zig.zon 文档（zig 仓库）](https://github.com/ziglang/zig/blob/master/doc/build.zig.zon.md)
- [PR #17392：rework package manager](https://github.com/ziglang/zig/pull/17392)（Fetch 任务与 zon paths 的历史背景）
- [PR #35428：separate maker from configurer](https://github.com/ziglang/zig/pull/35428)（2026 rework 主体）
