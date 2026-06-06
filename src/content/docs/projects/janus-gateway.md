---
title: Janus WebRTC Gateway
description: C 语言 WebRTC 网关，插件架构支持 SFU/录制/流转推
来源: 'https://github.com/meetecho/janus-gateway'
日期: 2026-06-06
分类: 操作系统
子分类: 嵌入式
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Janus WebRTC Gateway** C 语言 WebRTC 网关，插件架构支持 SFU/录制/流转推。

日常类比：像可插模块的交换机：核心路由固定，视频会议/直播各插一块。

典型用法：克隆仓库读 README，跑官方最小示例，再对照源码目录理解模块边界。

## 为什么重要

- 学 WebRTC 服务端经典实现
- 插件式扩展边缘部署
- 对照 [[livekit]] 单体 SFU
- 嵌入式轻量网关参考

## 核心要点

1. **架构分层**：先分清 UI/核心库/IO 边界，再读入口 main。
2. **数据流**：跟踪一份输入如何变成输出（帧、包、tensor）。
3. **依赖**：看清系统库与第三方，避免装错环境。
4. **扩展点**：插件、配置、钩子在哪里暴露。
5. **运维**：日志、指标、崩溃复现路径。

## 实践案例

### 案例 1：最小可运行

```bash
git clone <repo-url>
cd janus-gateway
# 按官方文档安装依赖后运行 demo
```

对照 README 的参数表，改一个选项观察输出变化。

### 案例 2：读源码入口

从 `main` / `CMakeLists.txt` / `package.json` 找模块图；画一张三框数据流草图。

### 案例 3：与邻居项目对照

对照 [[livekit]] 的实现差异：协议、语言、部署形态各写一条笔记。

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

- 官方仓库：https://github.com/meetecho/janus-gateway
- [[livekit]]
- [[pion]]
- [[mediasoup]]
- [[nginx-rtmp-module]]
- [[obs-studio]]

## 关联

- [[livekit]] —— 同专题对照阅读
- [[pion]] —— 同专题对照阅读
- [[mediasoup]] —— 同专题对照阅读
- [[nginx-rtmp-module]] —— 同专题对照阅读
- [[obs-studio]] —— 同专题对照阅读

## 维护备注

- 合并后运行 `npm run atlas` 刷新反向链接。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[jitsi-meet]] —— Jitsi Meet — 开源视频会议
- [[livekit]] —— LiveKit — 开源实时多媒体 SFU
- [[mediasoup]] —— mediasoup — WebRTC 选择性转发 SFU
- [[nginx-rtmp-module]] —— nginx-rtmp-module — 用 nginx 搭 RTMP/HLS 直播服务
- [[obs-studio]] —— OBS Studio — 开源直播录制与推流
- [[pion]] —— Pion — 纯 Go 实现的 WebRTC 协议栈

