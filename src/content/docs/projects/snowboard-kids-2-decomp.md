---
title: Snowboard Kids 2 100% 反编译 — 把 N64 卡带「翻译」成可读 C 代码
来源: 'https://github.com/cdlewis/snowboardkids2-decomp'
日期: 2026-06-13
子分类: 类型与 PL 理论
分类: 编程语言
provenance: pipeline-v3
难度: 中级
---

## 是什么

2026 年 5 月，N64 经典滑雪竞速游戏 **Snowboard Kids 2**（日版名 *Chou Snobow Kids*）宣布达成 **100% matching decompilation**：仓库里每一个游戏函数都有对应的 C 实现，用现代工具链编译后生成的 MIPS 汇编，与 1999 年卡带 ROM 里的字节级结果一致。进度看板 [decomp.dev/cdlewis/snowboardkids2-decomp](https://decomp.dev/cdlewis/snowboardkids2-decomp) 显示约 **694 KB 代码**与 **18.56 MB 数据段**已全部匹配。

日常类比：原版 ROM 像一本只印了「机器语」的绝版书——你能玩，但没人看得懂剧情怎么写的。matching 反编译不是「猜个大概能跑」，而是**逐页对照**，用 C 重写每一章，再印刷出一本与原版逐字相同的复刻本。你手里仍需要合法持有的原卡带/ROM 作为「母本」；仓库本身**不包含**游戏资产与商业 ROM，只提供逆向出来的源码与构建脚本。

项目主页：[cdlewis/snowboardkids2-decomp](https://github.com/cdlewis/snowboardkids2-decomp)。维护者 Chris Lewis 在 [项目博客](https://blog.chrislewis.au/) 与 NeoGAF/Hacker News 上说明：里程碑意义在于把「一堆 MIPS 汇编写成的黑盒」变成可读、可构建、可研究、可 mod 的代码库——为 **recompilation（原生重编译到 PC 等平台）**、资源提取与机制分析铺路。注意：反编译仓库**不是** PC 移植本身；PC 可玩版本是并行的 [Snowboard Kids 2: Recompiled](https://github.com/snowboardkids2/snowboardkids2-recomp) 一类工作。

## 为什么重要

不了解这类 N64 反编译项目，很难理解近几年复古游戏社区的几次「质变」：

- **SM64、Ocarina of Time、Pilotwings 64** 等 matching decomp 完成后，社区出现了大量机制 mod、60fps 补丁、调试菜单——因为改的是**有类型的 C**，不是在海量十六进制里盲改。
- **「100% 反编译」≠「完全读懂」**：函数可能仍叫 `func_80041234`，结构体字段仍靠猜；但**构建闭环**（重编译 ROM 校验通过）证明行为与原版等价，后续命名与文档可以渐进完成。
- **AI 辅助反编译**在 2024–2026 的 Snowboard Kids 2 项目上被系统验证：早期 one-shot 能把匹配率从约 25% 拉到 58%，尾部的图形 display list、矩阵运算等「长尾函数」仍要靠社区、相似函数检索、人工与更新一代模型硬啃。
- **法律与伦理边界**：项目声明为 clean-room、非商业、需自备合法 ROM；不接受泄露源码或专有知识的贡献——这与「随便下个 ROM 就能发 PC 版」不是一回事。

## 核心概念

### 1. Matching decompilation（匹配式反编译）

目标不是「写一个看起来像的游戏」，而是：

```
合法持有的原版 ROM  →  提取资产 + 分析机器码  →  人工/工具写 C
                                                      ↓
                                            编译 + 链接 + 打包
                                                      ↓
                              新 ROM 与原版 SHA1 / 逐函数 asm diff 完全一致
```

N64 游戏主 CPU 是 **MIPS R4300**，图形走 **RDP** 与 **F3DEX2** 等微码库。Snowboard Kids 2 使用任天堂标准 F3DEX2，比「游戏自带奇葩微码」的项目友好一些，但 **display list**（GPU 指令字节流）仍是最难啃的骨头之一。

### 2. 仓库里各目录分工

| 路径 | 作用 |
|------|------|
| `src/` | 已（或部分）反编译出的 C 源码 |
| `include/` | 结构体、常量、对外声明 |
| `asm/nonmatchings/` | 尚未匹配函数的原始汇编（每函数一文件） |
| `asm/matchings/` | 已匹配函数的汇编快照，便于对照 |
| `assets/` | 从 ROM 提取的二进制资产（贴图、音频等） |
| `lib/` | 链接用的库代码（如 Ultralib） |
| `tools/` | asm-differ、decomp 环境脚本、校验工具 |

未匹配函数在 C 里通常以 **占位宏** 形式「引用」汇编文件，匹配成功后再替换成真正的 C 实现。

### 3. INCLUDE_ASM 占位与替换

反编译进行中的典型模式：C 文件里暂时拉入汇编，而不是空函数 stub：

```c
// src/game/player.c（示意：进行中的常见写法）

#include "common.h"

// 尚未匹配时：直接嵌入从 ROM 抠出的 MIPS 汇编
INCLUDE_ASM("asm/nonmatchings/game/player/update_player_physics");

void init_player(PlayerState* player) {
    player->speed = 0;
    player->airborne = FALSE;
}
```

当 `update_player_physics` 在 [decomp.me](https://decomp.me/) 或本地 scratch 里 **100% match** 后，删掉 `INCLUDE_ASM` 行，换成等价 C（项目要求尽量用结构体字段访问，避免裸指针算术）：

```c
void update_player_physics(PlayerState* player, f32 delta) {
    if (player->airborne) {
        player->velocity.y -= GRAVITY * delta;
    }
    player->position.x += player->velocity.x * delta;
    player->position.y += player->velocity.y * delta;
    player->position.z += player->velocity.z * delta;
}
```

然后必须跑完整构建校验——**单个函数在 scratch 里匹配**，不等于全项目仍能通过 ROM checksum。

### 4. 构建与「OK」判据

官方 README 给出的流程（Linux x86 已验证；Windows/macOS 仍在贡献 wishlist 中）：

```bash
# 1. 克隆含子模块
git clone --recurse-submodules -j8 git@github.com:cdlewis/snowboardkids2-decomp.git
cd snowboardkids2-decomp

# 2. 准备工具链与 Python 依赖
make setup
python3 -m venv .venv && source .venv/bin/activate
python3 -m pip install -U -r requirements.txt

# 3. 自备大端 Snowboard Kids 2 ROM，命名为 snowboardkids2.z64 放在仓库根目录
make clean
make extract    # 从 ROM 提取资产到 assets/
make            # 编译并链接

# 唯一公认的成功标准：
# build/snowboardkids2.z64: OK
```

`OK` 表示重生成的 ROM 与目标校验和一致。维护者在 agent 工作流里用 `./tools/build-and-verify.sh` 防止「改校验和假装成功」这类事故；改结构体后还要对**同文件内所有相关函数**跑 asm-differ，避免牵一发而动全身。

### 5. asm-differ：逐指令对照

```bash
# 查看某函数：编译出的汇编 vs ROM 中提取的汇编
python3 tools/asm-differ/diff.py --no-pager update_player_physics
```

输出会标出哪条 MIPS 指令或哪个寄存器分配不一致。反编译者据此微调 C：换临时变量顺序、改 `s32`/`u32`、加 `volatile`、乃至在极少数行保留 `__asm__` 内联——Snowboard Kids 2 在 100% 时仍承认少量 asm hack 存在。

### 6. 反编译 vs 重编译（decomp vs recomp）

| | Matching decomp | Native recompilation |
|--|----------------|----------------------|
| 产物 | 与原版相同的 `.z64` ROM | Windows/Linux 等原生可执行文件 |
| 是否需要原版 ROM 参与构建 | 是（提取资产 + 对照） | 通常链接反编译产物 + 平台 shim |
| 典型目标 | 证明等价、方便读代码与 mod 逻辑 | 宽屏、高帧率、现代输入、联机 |
| 本项目 | [snowboardkids2-decomp](https://github.com/cdlewis/snowboardkids2-decomp) | 社区中的 Recompiled 分支（宽屏、视距等已有演示） |

两者是流水线上下站：没有可读、可构建的 C，原生移植只能停留在模拟器套壳；有了 100% decomp，PC 版可以真正编译为 x86_64/ARM 机器码，而不是模拟 MIPS。

### 7. 工具链与社区生态

- **[decomp.dev](https://decomp.dev/)**：各项目匹配率、历史曲线、CI 徽章。
- **[decomp.me](https://decomp.me/)**：在线 scratch，协作匹配单个函数。
- **N64 decompilation Discord**：Snowboard Kids 2 最后十个最难函数由 Bl00D4NGEL、inspectredc、SlaveOfIDO、queueRAM 等与维护者协作完成。
- **相似函数检索**：后期用 Coddog、嵌入向量等方式找「长得像」的已匹配函数，给 LLM 当 few-shot 参考，比单纯按「指令条数」排序更有效。
- **Docker + mips 交叉工具链**：`binutils-mips-linux-gnu` 等依赖保证编译出的汇编与 1999 年 IDO 编译器习惯对齐。

### 8. AI 辅助的真实边界（Chris Lewis 博客要点）

- **前 50% 往往快**：coding agent 对中等复杂度 C 函数 one-shot 成功率高。
- **长尾极难**：超过约 1000 条指令的巨型函数、F3DEX2 display list 宏展开、矩阵/向量数学——模型容易「放弃」或产出能编译但不匹配的 C。
- **Permuter**（暴力重排表达式以蹭匹配）与 agent 结合容易引入脏代码，该项目后期曾停用 permuter 以免陷入噪声优化。
- **工程纪律**：git worktree 并行、Claude hooks 禁止改 SHA1、任务编排器（如 Nigel）批量跑「重命名」「文档化」循环——说明这是**软件工程问题**，不只是「让模型看一眼汇编」。

## 实践案例

### 案例 1：从零验证「我真的在复刻卡带」

假设你已有合法 ROM，只想确认环境没骗人：

```bash
cd snowboardkids2-decomp
sha1sum snowboardkids2.z64    # 记录原版指纹（与项目文档/US 版一致）
make clean && make extract && make
sha1sum build/snowboardkids2.z64
# 若脚本输出 build/snowboardkids2.z64: OK，说明重编译产物与目标一致
```

若 `make` 失败在链接或数据段，常见原因是 ROM 区域版本不对（需 **big-endian US** 命名 `snowboardkids2.z64`）或子模块未拉取完整。

### 案例 2：认领一个 nonmatching 函数

1. 在 [未匹配列表](https://chrislewis.au/snowboardkids2-decomp/) 或 `asm/nonmatchings/` 选一个函数。
2. 运行项目脚本进入 isolated scratch（README/CLAUDE.md 中的 `./tools/claude-decomp.sh <name>` 一类入口）。
3. 写 `base.c`、`base_2.c`… 迭代直到 `diff.py` 全绿。
4. 回到主仓库替换 `INCLUDE_ASM`，跑 `./tools/build-and-verify.sh`。
5. 提交 PR；**不得**基于泄露源码或从未玩过的「内部知识」。

贡献清单里长期欢迎：消 compiler warning、把 `D_80123456` 改成语义化名字、用结构体替换指针算术、补充 cheat code / 关卡加载文档——100% 匹配只是「可读性的起点」。

## 与相近项目的对比

| 项目 | 平台 | 状态（约 2026） | 备注 |
|------|------|-----------------|------|
| Snowboard Kids 2 decomp | N64 | **100% code matched** | 本笔记主题；AI+社区混合 |
| Super Mario 64 decomp | N64 | 早已 100% | 模改与学术研究标杆 |
| Zelda OOT / MM decomp | N64 | 100% | 机制分析、随机izer 基础 |
| Pilotwings 64 decomp | N64 | 100% | 体量较小 |
| Mario Golf 64 | N64 | 进行中 | 社区多条 N64 线并行 |

Snowboard Kids 2 的特殊性在于：**中等体量、F3DEX2 标准图形栈、强烈怀旧属性但长期缺官方移植**——100% decomp 直接点燃了「宽屏 PC 版 + 可能的 SK1+SK2 合集」想象，但法律上仍依赖个人持有原版与社区非商业约定。

## 常见问题

**Q：仓库能直接让我免费玩吗？**  
不能。没有 ROM 就无法 `make extract`；没有资产与匹配代码也编不出可玩镜像。Recompiled 发行若出现，也会是独立仓库与合规叙事。

**Q：100% 了为什么还说「工作在进行」？**  
命名、结构体清理、资产 YAML 化、去掉 `__asm__`、SK1 反编译、Super Snowboard Kids 合集构想——这些是「理解游戏」层的工作，不匹配率不等于完成度。

**Q：想学反编译，从哪入门？**  
先读 [decomp.me](https://decomp.me/) 教程与任意小型 N64 子系统；读 Chris Lewis 系列文章：《Using Coding Agents to Decompile Nintendo 64 Games》《The Long Tail of LLM-Assisted Decompilation》；在 Discord 里看别人 scratch。Snowboard Kids 2 已是**成熟期项目**，新手更适合从仍有 nonmatchings 或文档更友好的 decomp 入手，再把这里当「终点形态」参考。

**Q：和模拟器有什么关系？**  
模拟器在运行时解释 MIPS；decomp 在开发时把 MIPS **还原成 C 再编译回 MIPS**。Recomp 则跳过 MIPS，直接生成主机原生代码。玩家最终可能三者都接触不到，但维护者路径不同。

## 小结

Snowboard Kids 2 的 **100% matching decompilation**（2026 年 5 月宣布，[decomp.dev](https://decomp.dev/cdlewis/snowboardkids2-decomp) 持续跟踪）把一款 1999 年的 N64 竞速游戏从「只能模拟器里跑的 ROM」变成了**可验证等价、可 fork、可文档化**的 C 工程。核心手法是：ROM 提取资产、`INCLUDE_ASM` 渐进替换、asm-differ 逐函数对齐、`build/snowboardkids2.z64: OK` 作为唯一验收标准。

对零基础学习者，最值得带走的三句话：

1. **Matching** 追求的是字节级等价，不是「玩法差不多」。  
2. **社区 + 工具链 + 纪律化 CI** 与模型一样重要，尾部函数往往靠人收尾。  
3. **Decomp 是源代码里程碑，Recomp 才是玩家眼里的「上 PC」**——两者相关，但仓库职责不同。

若你关心 N64 硬件、复古移植或 LLM 在软件考古中的边界，Snowboard Kids 2 是目前（2026）最能同时看到「热血成果」与「诚实长尾」的公开案例之一。

## 延伸阅读

- 仓库 README 与 [Contributing](https://github.com/cdlewis/snowboardkids2-decomp/blob/main/README.md)
- 进度看板：[decomp.dev — Snowboard Kids 2](https://decomp.dev/cdlewis/snowboardkids2-decomp)
- 维护者博客：[Snowboard Kids 2 is 100% Decompiled](https://blog.chrislewis.au/) 及 LLM 辅助反编译系列
- 讨论串：[NeoGAF](https://www.neogaf.com/threads/snowboard-kids-2-is-100-decompiled.1696938/) / [Hacker News](https://news.ycombinator.com/item?id=48284494)
- 相似生态：[@n64decomp](https://github.com/n64decomp) 组织下各项目、Zelda 反编译 Wiki 风格文档
