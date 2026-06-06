---
title: dust — du 的可视化替代，按目录大小排树状条形图
来源: 'https://github.com/bootandy/dust'
日期: 2026-05-30
子分类: 命令行工具
分类: CLI
难度: 初级
provenance: pipeline-v3
---

## 是什么

dust 是 Rust 写的命令行工具，**功能等同 `du`**——告诉你一个目录占多大磁盘，但**输出方式完全不一样**：它直接画一棵带条形图的树，最大的子目录排最上面，颜色越深占比越高。

日常类比：du 像让你看 Excel 一列数字，自己排序、找最大、算占比；dust 像直接给你一张柱状图，一眼看出谁是仓库里最胖的那个。

跑一次大概长这样：

```text
 5.4G ┌── node_modules     │██████████████████████████│ 64%
 1.8G ├── .git             │█████████░░░░░░░░░░░░░░░░░│ 22%
 800M ├── dist             │████░░░░░░░░░░░░░░░░░░░░░░│ 10%
 8.4G ┴ ./
```

不用再写 `du -sh * | sort -h | head` 这种"老 Unix 流"的拼接。dust 一条命令同时帮你做了**汇总 + 排序 + 比例可视化**。

## 为什么重要

不理解 dust 这类"现代 CLI 替代"，下面这些事都解释不清：

- 为什么 Rust 社区出了 ripgrep / fd / bat / dust 之后，老 Unix 工具突然显得"不够用"
- 为什么"看磁盘哪里被吃了"明明是 1971 年就该解决的问题，2018 年还在被重做
- 为什么"输出可视化"是 CLI 工具能成爆款的关键变量，不是"功能更多"
- 为什么开发机磁盘一爆炸，老手第一反应是 `dust ~`，而不是 `du -sh *`

## 核心要点

dust 做的事可以拆成 **3 步**：

1. **并行 walk 目录树**：从你给的起点开始递归 stat 每个文件，多线程并行（Rust 的 `rayon`），所以扫几十万文件依然秒级出结果。类比：派一队人同时数仓库里每个箱子重量。

2. **聚合 + 排序**：把每个子目录大小往上累加，到顶层后按大小降序，截掉太小的（默认只显示和终端高度匹配的 top N）。类比：每队报回数字后，按重量排队站好。

3. **渲染条形图 + 颜色梯度**：用 Unicode 方块（▇▆▃░）画一条占比条，颜色按"占父目录比例"从浅到深渐变，再加 ASCII 树枝（┌─├─└）拼成树形结构。类比：给排好队的箱子画一张直观的柱状图。

三步的关键是 **第 3 步**：du 也做了 1+2，但只输出数字。dust 把"人脑要做的视觉对比"提前在终端里完成。

## 实践案例

### 案例 1：磁盘报警，5 秒定位空间杀手

半夜笔记本磁盘红了，跑：

```bash
dust ~/
```

输出立刻告诉你 `~/Library/Caches` 占 40G、`~/projects/ml-experiment/checkpoints` 占 35G。**不用看一长串数字、不用排序**——颜色和条形长度直接告诉你眼睛该看哪里。

老办法要写 `du -sh ~/* | sort -hr | head -10`，三个命令拼一起还是一列纯数字；dust 一条命令直接给图。

如果想看更多条目（默认按终端高度截），加 `-n 30` 显示 top 30：

```bash
dust -n 30 ~/
```

### 案例 2：限制深度 + 锁定 monorepo 重灾区

monorepo 项目想看哪个子包最重：

```bash
dust -d 2 .
```

`-d 2` 限制只看 2 层，避免被 `node_modules/some-pkg/node_modules/...` 淹没。秒看出 `packages/web` 因为 dist 没清而占了 4G，剩下的包都在 100M 以内。

如果你只关心"最大的几个文件"而不是目录汇总，`-F` 切到 file 模式：

```bash
dust -F -d 4 ~/Downloads
```

会列出真正的大文件（视频、虚拟机镜像、装机包），而不是把整个 Downloads 当一个 30G 的块给你看。

### 案例 3：CI 里输出 JSON 当磁盘画像基线

```bash
dust -j /var/lib/docker > disk-snapshot.json
```

`-j` 输出 JSON，丢给监控系统当基线，下次跑完 diff 就能看出哪一层 Docker 镜像在膨胀。dust 不只是给人看，机器也能消费。

## 踩过的坑

1. **默认是 disk usage 不是 apparent size**：dust 默认报"实际占了多少块"（4KB 对齐），du 也一样。如果你比对的是 `ls -l` 的逻辑大小，会差几个百分点——加 `-b` 切到 apparent size 才能对齐。

2. **极深嵌套触发栈溢出**：dust 用递归 walk，碰到 1000+ 层嵌套（构建产物、go vendor）会爆栈。解决：`-S` 调大栈，或者 `-d 3` 限制深度直接绕开。

3. **硬链接默认只算一次**：Time Machine 备份、pnpm store 里有大量硬链接，dust 默认按 inode 去重，可能算出来比 `du` 小。需要"物理空间总和"加 `-P`（physical）才算全。

4. **snap 安装版被沙箱锁死**：Ubuntu snap 装的 dust 只能扫 `/home`，扫 `/var/log` 直接 permission denied。换 `cargo install du-dust` 或 brew 装的非沙箱版才能扫系统盘。

## 适用 vs 不适用场景

**适用**：

- 交互式排查"磁盘哪里满了"——本地、服务器、CI workspace
- 给同事 / 自己 5 秒看懂一个项目的体积分布
- 替换日常 `du -sh * | sort -h` 这种老组合的所有场景

**不适用**：

- 程序化精确尺寸（写脚本、做账）→ 用 `du -b` 或直接 `stat`，dust 的可视化是噪音
- 实时监控大目录变化 → 用 `inotifywait` / `fswatch`，dust 是单次快照
- 需要交互式删除（"看到大就直接删"）→ 用 `ncdu`，dust 只读不写
- Windows 老 cmd / 不支持 Unicode 的终端 → 条形图会糊成乱码，加 `-c` 走纯字符

## 历史小故事（可跳过）

- **1971 年**：Unix v1 自带 `du`（disk usage），输出就是"路径 + 数字"，50 年没变过形态。
- **2010 年代**：`ncdu` 出来，给 du 加了交互式 TUI，但还是字符表格风。
- **2018 年**：Andy Boot（GitHub `bootandy`）发布 dust，第一次把"条形图 + 颜色梯度"塞进 du 这类工具，定位非常窄就是"du 的 UX 升级"。
- **后续**：成为 Rust CLI 复兴的代表之一，和 ripgrep（grep 替代）、fd（find 替代）、bat（cat 替代）一起被打包推荐。

dust 的核心创新不在算法（`du` 的算法 50 年没变），在**输出层**。这是 CLI 工具的一个反直觉点：**功能没变、UX 改一刀就能成爆款**。

## 学到什么

1. **CLI 工具的差异化往往在输出层，不在功能层**——dust 干的事 du 都能干，但 dust 把"人脑要做的视觉对比"提前画了。
2. **Rust 让"重做老工具"变得划算**——单二进制、跨平台、性能不输 C，过去 `coreutils` 鄙视链上的"重做"现在收益和成本都翻转了。
3. **窄定位是优点**——dust 没要替代 ncdu 的交互模式，也没要做 monitoring，就是 du 的可视化升级，反而能 10k star。
4. **"工具是肌肉记忆"**：dust 的命令行参数和 du 几乎对齐（`-d` 深度、`-s` 汇总），让人切换零成本。

## 延伸阅读

- 仓库 README：[bootandy/dust](https://github.com/bootandy/dust)（5 分钟看完所有参数 + 示例图）
- 安装指南：`brew install dust` / `cargo install du-dust`（注意 crate 名带 `du-` 前缀，避免和别的 dust 包冲突）
- 同类对比：[r/rust 现代 CLI 替代清单](https://github.com/ibraheemdev/modern-unix)（dust / ripgrep / fd / bat / hyperfine 一站打包）
- 旧时代对照：`man du` —— 看一遍 50 年前 Unix 怎么解决同一个问题，体会 UX 跨度
- [[ripgrep]] —— grep 的 Rust 替代，和 dust 同源思路
- [[fd]] —— find 的 Rust 替代，参数风格也类似

## 关联

- [[ripgrep]] —— grep 的 Rust 重做，"输出层升级 + 性能不输 C"的鼻祖
- [[fd]] —— find 的 Rust 重做，参数风格和 dust 一样反传统
- [[bat]] —— cat 的 Rust 重做，加了语法高亮和分页
- [[fzf]] —— 命令行模糊查找，常和 dust 配合（dust 列大目录 → fzf 选 → cd 进去）
- [[biome]] —— Rust 写的 JS/TS 工具链，同样"重做老工具 + 单二进制"路线
- [[swc]] —— Rust 写的 JS/TS 编译器，性能对照 babel 的 CLI 复兴样本

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bat]] —— bat — 现代 cat 替代
- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[bottom]] —— bottom — Rust 写的跨平台终端进程监控（widget 自由拼）
- [[broot]] —— broot — 把 tree 命令升级成会过滤、能 cd、显大小、看 git 的交互树
- [[fzf]] —— fzf — 命令行模糊查找
- [[htop]] —— htop — top 的彩色交互替代（鼠标点选 / 树视图 / 过滤）
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep
- [[sd]] —— sd — 直觉语法的 sed 替代品（Rust 写的 find-and-replace）
- [[swc]] —— SWC — Rust 写的 TS/JS 编译器

