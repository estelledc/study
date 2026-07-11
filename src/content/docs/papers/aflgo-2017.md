---
title: AFLGo — 让灰盒 fuzzing 朝目标代码前进
来源: 'Marcel Böhme, Van-Thuan Pham, Manh-Dung Nguyen, Abhik Roychoudhury, "Directed Greybox Fuzzing", CCS 2017'
日期: 2026-07-09
分类: security-privacy
难度: 中级
---

## 是什么

日常类比：普通 fuzzing 像在整座城市随机试路，看到新街区就继续逛；AFLGo 像给外卖员开导航，目标不是“哪里都逛到”，而是“尽快走到那几个可能出事的地址”。

AFLGo 是 Directed Greybox Fuzzing（定向灰盒 fuzzing）的代表工具。它继承 AFL 的高速随机变异和覆盖率反馈，但额外告诉 fuzzer：每个输入离目标代码位置还有多远。

这些目标位置可以是刚改过的补丁行、崩溃栈上的函数、危险系统调用，或静态分析工具指出的可疑位置。AFLGo 的核心问题是：在仍然保持灰盒 fuzzing 高吞吐的前提下，怎样把更多时间花在更接近目标的 seed 上。

这篇论文的价值在于把“朝目标 fuzz”做成工程可跑的系统：编译期算距离，运行期只收集距离和覆盖率，再用模拟退火的 power schedule 分配能量。

## 为什么重要

不理解 AFLGo，下面这些事都很难解释：

- 为什么修完一个安全 bug 后，仍然需要围着补丁附近继续测，而不是只跑全量回归
- 为什么 AFL 这种随机工具很快，但在“我要复现这个崩溃栈”时可能把时间花到无关路径上
- 为什么符号执行能精准朝目标走，却经常被路径约束、求解器和真实系统代码拖慢
- 为什么 OSS-Fuzz 这类持续 fuzzing 平台需要把新提交、新补丁、新风险点变成测试方向

## 核心要点

1. **目标位置改变了优化目标**：普通 coverage-guided fuzzing 奖励“发现新路径”，AFLGo 奖励“离指定目标更近”。类比：考试复习不再平均看整本书，而是优先复习老师刚圈出的章节。

2. **距离在编译期预先算好**：AFLGo 从 call graph 和每个函数内部的 control-flow graph 里估算基本块到目标的距离。类比：导航软件先离线算好城市路网，开车时只需要不断读当前位置。

3. **模拟退火控制探索和冲刺**：早期 AFLGo 像 AFL 一样探索，避免一开始就卡在看似最近但其实走不通的路；时间越往后，越把能量给离目标近的 seed。类比：找路前半小时多试几条岔路，最后十分钟集中冲向最可能到达的路线。

这三点合起来，让 AFLGo 既保留灰盒 fuzzing 每秒执行大量输入的速度，又能服务补丁测试、崩溃复现和安全回归这种“目标明确”的任务。

## 实践案例

### 案例 1：补丁测试只盯刚改过的代码

假设一个解析器刚加了边界检查，但真正危险的内存拷贝仍在附近：

```c
int len = read_len(buf);
if (len > remaining) return ERROR; // 新补丁
memcpy(out, buf, len);             // 仍然危险
```

**逐部分解释**：

- 普通 AFL 会继续追求全程序覆盖率，可能花很多时间测试完全无关的解析分支
- AFLGo 把新补丁行和附近基本块作为 targets，让 seed 朝这些位置靠近
- 如果补丁只挡住了某一种输入，AFLGo 更容易在同一片代码周围找到“换个形状仍然能崩”的输入
- 论文在 LibXML2 和 LibMing 场景里展示了这种 incomplete fix：bug 看似修了，但类似路径还会触发崩溃

### 案例 2：用崩溃栈复现线上 crash

崩溃报告常常只给你一段 stack trace，而不是完整触发输入：

```txt
crash stack:
parse_png_chunk
read_palette
copy_bytes
targets:
parser.c:120
image.c:88
```

**逐部分解释**：

- 这些函数名和源码行可以转成 AFLGo 的目标位置
- AFLGo 不需要证明某条路径一定可达，只要不断变异输入并观察距离有没有缩短
- seed 走到 `read_palette` 附近时，后续会获得更多 fuzzing 能量
- 论文中 AFLGo 在 LibPNG 和 Binutils 的 crash reproduction 上通常比普通 AFL 更快，在 BugRedux benchmark 上也复现了更多 crash

### 案例 3：把代码变更接进 CI 安全回归

在自动化流水线里，可以把 diff 转成目标列表，再启动定向 fuzz：

```bash
git diff --unified=0 old new > patch.diff
extract-changed-lines patch.diff > targets.txt
aflgo-build --targets targets.txt ./configure
aflgo-fuzz -i seeds -o out -- ./parser @@
```

**逐部分解释**：

- `patch.diff` 提供“本次最值得怀疑的代码位置”
- `targets.txt` 是 AFLGo 的导航终点，真实项目会用脚本从文件名和行号生成
- 构建阶段插桩，把每个基本块到目标的距离写进二进制
- fuzz 阶段仍然是高速随机变异，只是调度时会偏向更接近目标的 seed

## 踩过的坑

1. **把 AFLGo 当成“保证到达目标”的工具**：它仍然是随机搜索，距离只是调度信号，不是可达性证明。

2. **只给一个过窄目标**：目标太少会让搜索过早收缩，原因是最近路径可能不可行，早期探索空间不够。

3. **忽略 seed corpus 质量**：AFLGo 可以从空文件起步，但好 seed 能显著缩短到达目标附近的时间。

4. **把距离当真实语义距离**：call graph 和 CFG 距离只是结构近似，原因是它不理解复杂输入格式和路径约束。

## 适用 vs 不适用场景

**适用**：

- 补丁测试：检查最近改动是否引入新 crash 或 incomplete fix
- 崩溃复现：只有 stack trace、目标函数或目标行号，需要自动生成触发输入
- 安全回归：围绕高风险组件、危险 API、静态分析告警位置做集中 fuzz
- 大型 C/C++ 项目：运行时需要保持 AFL 级别吞吐，无法承受重型符号执行

**不适用**：

- 需要严格证明“目标不可达”的验证任务，因为 AFLGo 不给形式化证明
- 输入格式极强、随机变异很难构造合法样本的协议，除非配合 grammar 或好 seed
- 目标位置完全不准的场景，导航终点错了，调度也会把能量带偏
- 多文件输入或复杂交互式程序，原始 AFLGo 工程能力可能需要额外适配

## 历史小故事（可跳过）

- **1990s**：Miller 等人用随机输入测试 UNIX 工具，fuzzing 这个名字开始流行。
- **2008 年**：KLEE 把符号执行推进到真实系统程序测试，证明“自动生成高覆盖输入”有工程价值。
- **2016 年**：AFLFast 把 coverage-guided fuzzing 建模成 Markov chain，并提出 power schedule 思路。
- **2017 年**：AFLGo 把 AFLFast 的能量调度继续推进：不是追低频路径，而是追用户给定的目标代码位置。
- **后来**：Directed greybox fuzzing 成为补丁验证、漏洞复现、静态告警验证里的常见工具路线。

## 学到什么

1. **fuzzing 的目标可以被重新定义**：覆盖率不是唯一目标，补丁行、崩溃栈和危险 API 也能成为搜索方向。
2. **工程速度来自前移成本**：AFLGo 把图分析放到编译期，运行期只做轻量聚合，因此没有丢掉灰盒 fuzzing 的吞吐优势。
3. **调度就是算法核心**：变异算子没变太多，真正的差别是哪个 seed 值得拿到更多 energy。
4. **随机搜索也能被温柔地引导**：模拟退火让 AFLGo 前期敢探索，后期能集中火力，不至于一开始就贪心卡死。

## 延伸阅读

- 原文 PDF：[Böhme et al. 2017 — Directed Greybox Fuzzing](https://mboehme.github.io/paper/CCS17.pdf)
- 工具项目：[AFLGo](https://github.com/aflgo/aflgo)（论文实现，理解工程结构时再看）
- [[bohme-aflfast-2016]] —— AFLGo 的 power schedule 思路直接接在 AFLFast 后面
- [[cadar-klee-2008]] —— 对比 directed symbolic execution 为什么更精准也更重
- [[newsome-taintcheck-2005]] —— taint 思路可以帮助理解“哪些输入字节更该变异”
- 综述论文：[The Progress, Challenges, and Perspectives of Directed Greybox Fuzzing](https://arxiv.org/abs/2005.11907)

## 关联

- [[bohme-aflfast-2016]] —— 先解释 seed energy 和 power schedule，AFLGo 在此基础上加入目标距离
- [[cadar-klee-2008]] —— KLEE 是 directed whitebox fuzzing 的底层代表，和 AFLGo 形成轻重对照
- [[newsome-taintcheck-2005]] —— 污点追踪关注输入如何影响危险位置，可与 directed fuzzing 互补
- [[avgustinov-codeql-2016]] —— 静态查询能指出可疑代码位置，AFLGo 可以把这些位置当 targets
- [[kildall-dataflow]] —— CFG 上传播信息的思想帮助理解基本块距离预计算
- [[cousot-abstract-interpretation]] —— 更一般地说明“用抽象程序信息引导分析”的理论背景
- [[testing-library]] —— 同样体现“测试目标要贴近真实风险”，只是一个在前端、一个在安全 fuzzing

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[autograph-2004]] —— Autograph 2004 — 自动给蠕虫写内容签名
- [[bohme-aflfast-2016]] —— AFLFast — 把 fuzzing 的力气花在更少人走的路径上
- [[driller-2016]] —— Driller 2016 — 用符号执行给 fuzzing 打穿深分支
- [[fairfuzz-2018]] —— FairFuzz 2018 — 保护关键字节，让 fuzzing 往深处走
