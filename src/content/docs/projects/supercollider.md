---
title: SuperCollider — 实时音频合成环境
description: 实时音频合成环境：sclang 语言 + scsynth 服务器
来源: 'https://github.com/supercollider/supercollider'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 中级
provenance: pipeline-v3
---

## 是什么

**SuperCollider** 实时音频合成环境：sclang 语言 + scsynth 服务器。

日常类比：像现场演奏的电子乐器：写代码即改声音，低延迟发声。

典型用法：克隆仓库读 README，跑官方最小示例，再对照源码目录理解模块边界。

## 为什么重要

- 学 client-server 音频架构
- 算法作曲与 live coding
- 对照 [[lmms]] GUI 作曲
- 交互声音装置

## 核心要点

1. **架构分层**：先分清 UI/核心库/IO 边界，再读入口 main。
2. **数据流**：跟踪一份输入如何变成输出（帧、包、tensor）。
3. **依赖**：看清系统库与第三方，避免装错环境。
4. **扩展点**：插件、配置、钩子在哪里暴露。
5. **运维**：日志、指标、崩溃复现路径。

## 核心架构

SuperCollider 采用严格的 **Client-Server 分离架构**，三个核心组件各司其职：

**sclang（SuperCollider 语言前端）**：
- 动态面向对象语言，语法类 Smalltalk，单继承类体系
- 承担调度、逻辑控制、GUI 渲染（Qt 绑定）和 OSC 消息生成
- 内置 `Routine`（协程）和 `TempoClock` 实现精确音乐节拍调度
- 通过 **OSC 协议（Open Sound Control，UDP/TCP）** 与 scsynth 通信

**scsynth（音频合成服务器）**：
- 独立进程，接收 OSC 消息并实时执行合成图
- 以 **SynthDef（合成定义）** 为单位加载 UGen 网络图；运行时动态实例化 Synth 节点
- 处理音频 I/O（JACK / CoreAudio / ASIO / WASAPI），缓冲区大小典型值 64~512 帧
- 硬实时优先级运行，主线程不做任何动态内存分配

**scide（SuperCollider IDE）**：
- 基于 Qt 的集成开发环境，内嵌代码编辑器、帮助浏览器、服务器状态表盘
- 支持代码片段即时求值（`Ctrl+Enter`），是 live coding 的核心工作流

**Unit Generator（UGen）体系**：

UGen 是 scsynth 内最小的信号处理单元，每个 UGen 在音频率（~44100Hz）或控制率（~689Hz）运行：

| 类别 | 常用 UGen | 说明 |
|------|---------|------|
| 振荡器 | `SinOsc`、`Saw`、`Pulse` | 正弦、锯齿、方波信号源 |
| 噪声 | `WhiteNoise`、`PinkNoise` | 均匀/粉色噪声源 |
| 滤波 | `LPF`、`HPF`、`BPF`、`RLPF` | 低通/高通/带通滤波器 |
| 混响 | `FreeVerb`、`GVerb`、`JPverb` | 不同算法混响效果 |
| 包络 | `EnvGen` + `Env` | 灵活的振幅/频率包络 |
| 采样 | `PlayBuf`、`BufRd` | 缓冲区读取/播放 |

## 生态工具

- **Quarks 包管理器**：SuperCollider 官方扩展仓库系统，安装方式：`Quarks.install("NameOfQuark")`。常用包包括 `Vowel`（共振峰合成）、`SC3Plugins`（额外 UGen 插件集）、`MIRLlib`（音乐信息检索）。
- **sc3-plugins**：C++ 编写的额外 UGen 库，补充物理建模、粒子合成等高级功能，需单独编译安装。
- **与 Max/MSP 对比**：Max 以图形化 patch 为主，SuperCollider 以代码为主；Max 商业闭源，SC 开源；Max 生态偏交互艺术，SC 更偏算法作曲与学术研究。
- **TidalCycles 整合**：TidalCycles（Haskell 算法节拍语言）可将 SuperCollider 作为音频后端，通过 OSC 发送音序控制消息，是 live coding 演出的流行组合。

## sclang 代码示例

```supercollider
// 启动音频服务器
s.boot;

// 简单正弦波音调（440Hz，持续 1 秒）
{ SinOsc.ar(440, 0, 0.3) }.play;

// 带振幅包络的合成
(
SynthDef(\mySynth, { |freq = 440, amp = 0.5, dur = 1|
    var env = EnvGen.kr(Env.perc(0.01, dur), doneAction: 2);
    var sig = SinOsc.ar(freq) * amp * env;
    Out.ar(0, sig ! 2);  // 双声道输出
}).add;
)

// 触发合成器
Synth(\mySynth, [freq: 880, amp: 0.4, dur: 0.5]);

// 算法序列（TempoClock 调度）
(
Pbind(
    \instrument, \mySynth,
    \degree, Pseq([0, 2, 4, 7, 4, 2], inf),  // C大调音阶
    \dur, 0.25,
    \amp, 0.4
).play;
)
```

## 实践案例

### 案例 1：最小可运行

```bash
git clone <repo-url>
cd supercollider
# 按官方文档安装依赖后运行 demo
```

对照 README 的参数表，改一个选项观察输出变化。

### 案例 2：读源码入口

从 `main` / `CMakeLists.txt` / `package.json` 找模块图；画一张三框数据流草图。

### 案例 3：与邻居项目对照

对照 [[lmms]] 的实现差异：协议、语言、部署形态各写一条笔记。

### 案例 4：接入自己的管线

把输出接到下游（播放器、训练 DataLoader、会议客户端），记录延迟与格式约束。

### 案例 5：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` 打开同子类邻居 1 篇，检查实践案例是否覆盖安装/命令/排障。

## 踩过的坑

1. **依赖版本漂移**：按文档锁版本，否则编译失败难定位。
2. **硬编解码路径**：GPU/驱动差异导致黑屏或崩溃，准备软解回退。
3. **权限与端口**：服务器组件忘开端口或 HTTPS 证书，客户端连不上。
4. **路径写死**：示例用绝对路径，换机器必挂。
5. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。
6. **JACK 优先级配置**：Linux 下 scsynth 需要实时线程权限（`/etc/security/limits.conf` 添加 rtprio），否则音频 underrun 频繁，glitches 明显。
7. **SynthDef 未发送到服务器**：新手常在调用 `Synth(\name)` 前忘记调用 `.add`（或 `.send(s)`），导致 "SynthDef not found" 错误。

## 适用 vs 不适用场景

**适用**：
- 学习该领域开源架构与模块边界
- 做原型验证或自建服务
- 与专题内邻居对照读

**不适用**：
- 闭源 SaaS 一键替代（若需合规审计）
- 超大规模不经优化的默认配置
- 不看文档直接改内核 fork

## 历史小故事（可跳过）

- 项目源于社区/公司开源贡献，Stars 随场景周期性上涨。
- 近年多与云原生、GPU、WebRTC 生态交叉。
- 文档与 issue 常比论文更新快，读 release note 很重要。
- 与 study 站邻居项目常构成「编码-传输-播放」全链。

## 学到什么

- 先跑通再读码，效率高于反过来。
- 开源多媒体/系统栈多为「薄壳 + 厚库」。
- 配置即架构，改一个 flag 可能换一条数据路径。
- 关联笔记要优先链到 `written.txt` 已有 slug。

## 延伸阅读

- 官方仓库：https://github.com/supercollider/supercollider
- [[lmms]]
- [[ardour]]
- [[sox]]
- [[essentia]]

## 关联

- [[lmms]] —— 同专题对照阅读
- [[ardour]] —— 同专题对照阅读
- [[sox]] —— 同专题对照阅读
- [[essentia]] —— 同专题对照阅读

## 维护备注

- 合并后运行 `npm run atlas` 刷新反向链接。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ardour]] —— Ardour — 专业级 DAW
- [[essentia]] —— Essentia — 音乐信息检索工具箱
- [[lmms]] —— LMMS — Linux 多媒体工作站
- [[sox]] —— SoX — 命令行音频处理瑞士军刀

