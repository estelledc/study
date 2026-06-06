---
title: scrcpy — Android 屏幕镜像 / 录制
description: Android 屏幕镜像与录屏，adb 拉 H.264 流到桌面
来源: 'https://github.com/Genymobile/scrcpy'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 中级
provenance: pipeline-v3
---

## 是什么

**scrcpy** Android 屏幕镜像与录屏，adb 拉 H.264 流到桌面。

日常类比：像把手机屏幕接一根 HDMI 线到电脑，还能键盘鼠标反控。

典型用法：克隆仓库读 README，跑官方最小示例，再对照源码目录理解模块边界。

## 为什么重要

- 学低延迟屏幕采集与硬编解码
- 理解 adb/USB 与无线推流
- 移动 UI 自动化录屏
- 对照 [[obs-studio]] 采集链

## 核心要点

1. **架构分层**：先分清 UI/核心库/IO 边界，再读入口 main。
2. **数据流**：跟踪一份输入如何变成输出（帧、包、tensor）。
3. **依赖**：看清系统库与第三方，避免装错环境。
4. **扩展点**：插件、配置、钩子在哪里暴露。
5. **运维**：日志、指标、崩溃复现路径。

## 核心架构

scrcpy 分为设备侧（Java）和主机侧（C）两部分，通过 ADB 通道连接：

**设备侧（scrcpy-server.jar）**：
- 通过 `adb push` 推送至手机 /data/local/tmp/，再通过 `adb shell` 以 app_process 方式启动
- 调用 Android MediaProjection API 捕获屏幕帧（需 Android 5.0+，Android 10+ 需二次确认）
- 使用设备硬件编码器（MediaCodec）将帧编码为 H.264 或 H.265/AV1（H.265/AV1 需 Android 10+）
- 通过 `adb forward`（USB）或 TCP（无线）将编码后的 NAL 单元流式传输到主机

**主机侧（C + SDL2）**：
- scrcpy 主进程建立 adb socket 连接，接收视频/音频编码流
- FFmpeg（libavcodec）解码 H.264/H.265/AV1 帧为 YUV 格式
- SDL2 将解码帧上传 GPU 纹理并渲染到窗口（支持 OpenGL / Direct3D / Metal 等后端）
- 键盘鼠标事件反向通过同一 ADB socket 发送至设备（模拟 MotionEvent 和 KeyEvent）

**音频转发（Android 11+）**：AudioPlaybackCapture API 捕获设备音频，编码为 Opus/AAC 后与视频流复用，主机侧解码后通过 SDL2 音频子系统播放。

**零延迟模式**：`--no-playback-buffer` 关闭解码缓冲区，以偶尔画面撕裂换取最低延迟，适合游戏场景。

## 性能与规格

| 传输方式 | 典型延迟 | 说明 |
|---------|---------|------|
| USB 有线 | 15~35ms | 取决于设备编码器和 USB 速度 |
| Wi-Fi 5GHz | 40~80ms | 受 AP 距离和干扰影响 |
| Wi-Fi 2.4GHz | 80~150ms | 延迟较高，不推荐实时操作 |

- `--max-size 1080`：限制最大边长，降低编码/解码负担
- `--video-bit-rate 4M`：控制码率（默认 8Mbps），弱网场景建议 2~4M
- `--max-fps 30`：限制帧率，降低 CPU/GPU 占用
- 音频延迟约 50~100ms，Opus 编码码率约 64~128kbps

## CLI 常用命令示例

```bash
# 基本镜像（USB 连接）
scrcpy

# 无线投屏（先 adb connect）
adb connect 192.168.1.100:5555
scrcpy --tcpip=192.168.1.100:5555

# 录制到本地文件（MP4）
scrcpy --record screen.mp4

# 仅录制，不显示窗口（适合 CI 自动化）
scrcpy --no-display --record output.mkv

# 限制分辨率 + 码率 + 帧率（弱性能机场景）
scrcpy --max-size 720 --video-bit-rate 2M --max-fps 24

# OTG 模式（模拟物理键盘鼠标，需设备支持）
scrcpy --otg

# 关闭设备屏幕（省电）同时保持镜像
scrcpy --turn-screen-off

# 截图保存到桌面
scrcpy --screenshot-to screenshot.png
```

## 实践案例

### 案例 1：最小可运行

```bash
git clone <repo-url>
cd scrcpy
# 按官方文档安装依赖后运行 demo
```

对照 README 的参数表，改一个选项观察输出变化。

### 案例 2：读源码入口

从 `main` / `CMakeLists.txt` / `package.json` 找模块图；画一张三框数据流草图。

### 案例 3：与邻居项目对照

对照 [[ffmpeg]] 的实现差异：协议、语言、部署形态各写一条笔记。

### 案例 4：接入自己的管线

把输出接到下游（播放器、训练 DataLoader、会议客户端），记录延迟与格式约束。

### 案例 5：移动端 UI 自动化录屏

将 scrcpy 录制与 Android UIAutomator 测试框架结合：

```bash
# 后台录制
scrcpy --no-display --record test_session.mp4 &
SCRCPY_PID=$!
# 执行自动化测试脚本
adb shell am instrument -w com.example/.TestRunner
# 停止录制
kill $SCRCPY_PID
```

录制文件可用于测试回放、Bug 复现报告和性能分析。

### 案例 6：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` 打开同子类邻居 1 篇，检查实践案例是否覆盖安装/命令/排障。

## 踩过的坑

1. **依赖版本漂移**：按文档锁版本，否则编译失败难定位。
2. **硬编解码路径**：GPU/驱动差异导致黑屏或崩溃，准备软解回退。
3. **权限与端口**：服务器组件忘开端口或 HTTPS 证书，客户端连不上。
4. **路径写死**：示例用绝对路径，换机器必挂。
5. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。
6. **MediaProjection 权限弹窗**：Android 10+ 每次启动 server 需要用户确认权限弹窗，自动化场景下弹窗会中断流程，需提前手动授权或通过 adb 命令模拟点击确认。
7. **H.265/AV1 编码器不存在**：部分 Android 设备不支持 H.265 硬编码，--video-codec=h265 会报错；回退到 h264 即可；可用 `adb shell cmd media.codec list` 确认设备支持的编码器列表。
8. **无线连接不稳定**：Wi-Fi 下 adb 连接容易断开，建议先 USB 连接后执行 `adb tcpip 5555` 切换到无线模式，保持 USB 调试功能开启。

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

- 官方仓库：https://github.com/Genymobile/scrcpy
- [[ffmpeg]]
- [[obs-studio]]
- [[opencv]]
- [[mediapipe]]
- [[decord]]

## 关联

- [[ffmpeg]] —— 同专题对照阅读
- [[obs-studio]] —— 同专题对照阅读
- [[opencv]] —— 同专题对照阅读
- [[mediapipe]] —— 同专题对照阅读
- [[decord]] —— 同专题对照阅读

## 维护备注

- 合并后运行 `npm run atlas` 刷新反向链接。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[ffmpeg]] —— FFmpeg — 多媒体转码与封装瑞士军刀
- [[mediapipe]] —— MediaPipe — Google ML 多模态流水线
- [[obs-studio]] —— OBS Studio — 开源直播录制与推流
- [[opencv]] —— OpenCV — 开源计算机视觉库与跨平台图像视频处理

