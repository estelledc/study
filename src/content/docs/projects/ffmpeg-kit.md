---
title: FFmpegKit — 把 FFmpeg 装进移动 App 的封装层
来源: 'https://github.com/arthenica/ffmpeg-kit'
日期: 2026-07-08
分类: 嵌入式
难度: 中级
---

## 是什么

FFmpegKit 是**给 Android / iOS / tvOS / Flutter / React Native App 使用 FFmpeg 的封装层**。日常类比：FFmpeg 像一台很强但只接受命令行的专业剪辑机，FFmpegKit 像把这台机器装进手机 App 的操作面板，让 Java、Objective-C、Dart、JavaScript 代码都能按按钮调用它。

最小例子长这样：

```java
FFmpegSession session =
    FFmpegKit.execute("-i input.mp4 -c:v mpeg4 output.mp4");
```

这行不是在手机里启动一个普通 shell，而是通过 FFmpegKit 的 wrapper API 把 FFmpeg 命令交给随包带进来的原生库执行，再把成功、失败、日志、进度统计包装成 session 返回给 App。

截至 2026-07，原仓库约 5.8k stars。官方于 **2025-01-06** 宣布退休，仓库约 **2025-06** 归档只读；**2026-07** README 补充说明维护延续到 FFmpegKitNext。学它的价值不是“新项目立刻采用”，而是看懂移动端如何把复杂 C/C++ 多媒体能力包装成跨平台 SDK。

## 为什么重要

不理解 FFmpegKit，下面这些事就很难解释：

- 为什么移动 App 不能简单假设手机里已经有 `ffmpeg` 命令
- 为什么同一个转码需求在 Android、iOS、Flutter、React Native 里要各自有语言绑定
- 为什么“视频包”“音频包”“full-gpl 包”不是命名花样，而是许可证和体积的工程选择
- 为什么一个转码按钮背后必须处理异步执行、进度回调、取消任务、文件权限和日志排查

## 核心要点

FFmpegKit 的核心可以拆成三件事：

1. **预编译二进制包**：它把 FFmpeg 和可选库提前编成 Android AAR、Apple framework / XCFramework、Flutter pub 包、React Native npm 包。类比：不是让用户自己采购零件组装相机，而是给你一台已经校准好的相机。

2. **Session 抽象**：每次 `execute` 或 `executeAsync` 都产生一个 session，里面有命令、参数、状态、返回码、输出、日志和统计。类比：你把衣服送去干洗，取衣单上记录了什么时候开始、什么时候结束、有没有失败、失败原因是什么。

3. **平台资源适配**：移动端文件不是都能用普通路径读写，Android 有 SAF uri，Apple 有沙盒和系统框架。FFmpegKit 在原生 FFmpeg 上补了一层平台适配，让命令能接触 App 可访问的资源。

这三条合起来，是“命令行能力 SDK 化”：保留 FFmpeg 命令的表达力，同时把执行生命周期交给 App 控制。

## 实践案例

### 案例 1：Flutter test app 里异步编码视频

官方 `ffmpeg-kit-test` 的 Flutter `VideoTab` 会先生成一条 FFmpeg 命令，再异步执行：

```dart
final ffmpegCommand =
    VideoUtil.generateEncodeVideoScriptWithCustomPixelFormat(
        image1Path, image2Path, image3Path, videoFile.path,
        videoCodec, getPixelFormat(), getCustomOptions());

FFmpegKit.executeAsync(
  ffmpegCommand,
  (session) async {
    final returnCode = await session.getReturnCode();
    if (ReturnCode.isSuccess(returnCode)) playVideo();
  },
  (log) => ffprint(log.getMessage()),
  (statistics) => updateProgressDialog());
```

**逐部分解释**：

- `generateEncodeVideoScript...` 把三张图片拼成一段视频，命令里包含缩放、拼接、帧率、编码器等参数
- `executeAsync` 不阻塞 UI 线程，转码完成后才进入第一个回调
- `log` 回调用来显示 FFmpeg 控制台输出，`statistics` 回调用来刷新进度条
- 成功后播放生成的视频；失败时读 return code 和 fail stack trace

### 案例 2：把字幕烧进视频

官方 Flutter `SubtitleTab` 先创建演示视频，再执行字幕滤镜：

```dart
String burnSubtitlesCommand =
  "-y -i ${videoFile.path} "
  "-vf subtitles=$subtitlePath:force_style='Fontname=Trueno' "
  "-c:v mpeg4 ${videoWithSubtitlesFile.path}";

FFmpegKit.executeAsync(burnSubtitlesCommand, (session) async {
  final returnCode = await session.getReturnCode();
  if (ReturnCode.isSuccess(returnCode)) playVideo();
});
```

**逐部分解释**：

- `-i ${videoFile.path}` 是输入视频
- `-vf subtitles=...` 是视频滤镜，把字幕直接渲染进每一帧
- `force_style` 指定字幕字体风格；官方示例会提前注册字体目录
- `-c:v mpeg4` 指定输出编码器，避免只改容器不重新编码

### 案例 3：用 pipe 把 App 内部数据喂给 FFmpeg

官方 Flutter `PipeTab` 演示了不落盘传输入：

```dart
final pipe1 = await FFmpegKitConfig.registerNewFFmpegPipe();
final pipe2 = await FFmpegKitConfig.registerNewFFmpegPipe();
final pipe3 = await FFmpegKitConfig.registerNewFFmpegPipe();

final cmd = VideoUtil.generateCreateVideoWithPipesScript(
    pipe1!, pipe2!, pipe3!, videoFile.path);

FFmpegKit.executeAsync(cmd, (session) async {
  FFmpegKitConfig.closeFFmpegPipe(pipe1);
  FFmpegKitConfig.closeFFmpegPipe(pipe2);
  FFmpegKitConfig.closeFFmpegPipe(pipe3);
});

FFmpegKitConfig.writeToPipe(image1Path, pipe1);
```

**逐部分解释**：

- `registerNewFFmpegPipe` 创建 FFmpeg 可以读取的临时管道
- 命令把三个 pipe 当成三个输入，后面仍然用普通 FFmpeg filter graph 处理
- `writeToPipe` 把 App 里的图片数据写进去，适合输入不方便暴露成普通文件路径的场景
- 结束后必须关闭 pipe，否则资源会留在进程里

## 踩过的坑

1. **仓库已退休**：2025-01 起 officially retired，2026-07 README 仍强调这一点并指向 FFmpegKitNext；新项目要先评估 FFmpegKitNext 或社区包。
2. **包名决定能力**：`min`、`audio`、`video`、`full`、`full-gpl` 启用的外部库不同，选错包会出现“命令存在但编码器不存在”。
3. **GPL 后缀不是装饰**：启用 GPL 库或使用 `-gpl` 预编译包会让整个 bundle 进入 GPL v3 约束，商业分发要先确认法务边界。
4. **移动文件路径最容易炸**：Android SAF uri、iOS 沙盒路径、空格和引号都会影响 FFmpeg 命令，必须用官方提供的 SAF / pipe / font directory API 处理。

## 适用 vs 不适用场景

**适用**：

- 已有移动 App 需要本地转码、压缩、抽帧、烧字幕、音频转换
- 需要 Flutter / React Native 调用 FFmpeg，但不想自己写 JNI / Objective-C bridge
- 需要在 App 里拿到执行进度、日志、取消能力，而不是只要一个黑盒命令
- 维护旧项目时，需要理解 MobileFFmpeg、flutter_ffmpeg、react-native-ffmpeg 的后继路线

**不适用**：

- 2025 退休之后从零启动、又必须长期跟进最新 FFmpeg 的新项目（应评估 FFmpegKitNext 或自建）
- 仍假设 Maven / CocoaPods / npm 能一键拉到官方预编译包——二进制已按计划下架，CI 会 404
- 只需要播放视频，不需要转码处理；这类场景用系统播放器或播放器 SDK 更轻
- 对 App 体积极端敏感，无法接受捆绑多媒体原生库
- 对许可证边界没有把握，却想直接使用 `full-gpl` 之类包

## 历史小故事（可跳过）

- **2000 年**：FFmpeg 项目诞生，逐渐成为多媒体转码和处理领域的事实标准。
- **2018-2020 年前后**：移动端社区常用 MobileFFmpeg、flutter_ffmpeg、react-native-ffmpeg 把 FFmpeg 带进 App。
- **2021 年**：FFmpegKit 统一这些路线，定位成支持 Android、Apple 平台、Flutter、React Native、Linux 的一套工具集合。
- **2023 年**：6.0 系列发布，Android / Apple、Flutter、React Native 包跟随 FFmpeg 6.0。
- **2025-01-06**：作者宣布 FFmpegKit officially retired；随后预编译包按计划从公共仓库下架，仓库约 2025-06 归档。
- **2026-07**：归档仓库 README 更新，指向原作者维护的 FFmpegKitNext；历史文档和 release 仍保留。

## 学到什么

- **FFmpegKit 的本质是包装生命周期**：难点不只是“跑命令”，而是把命令变成 App 可取消、可观察、可排错的 session。
- **移动端多媒体是二进制工程**：体积、CPU 架构、系统框架、许可证，比普通 JS/Python 库安装复杂得多。
- **包矩阵是产品设计**：min / audio / video / full 把“能力”和“成本”拆成可选项，让不同 App 只带自己需要的库。
- **归档也是学习材料**：一个项目退休后，仍然能作为 SDK 设计、跨平台绑定、原生库分发的案例来读。

## 延伸阅读

- [FFmpegKit README](https://github.com/arthenica/ffmpeg-kit) —— 项目定位、包矩阵、版本和退休说明
- [FFmpegKit Wiki: Android](https://github.com/arthenica/ffmpeg-kit/wiki/Android) —— Java API、session、SAF、回调示例
- [FFmpegKit Test](https://github.com/arthenica/ffmpeg-kit-test) —— 视频编码、音频编码、字幕、pipe、并发执行的官方演示 App
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html) —— 真正决定命令怎么写的上游文档
- [FFmpegKitNext](https://github.com/arthenica/ffmpeg-kit-next) —— 原作者维护的后续项目
- [[ffmpeg]] —— FFmpeg 本体，理解命令语义必须先看它

## 关联

- [[ffmpeg]] —— FFmpegKit 包装的就是 FFmpeg 命令和原生库
- [[gstreamer]] —— 另一套多媒体 pipeline 思路，比 FFmpegKit 更偏长期流式处理
- [[sharp]] —— 同样是把 C/C++ 媒体能力封装给上层语言，但 sharp 聚焦图像和 Node.js
- [[react]] —— React Native 版本需要把原生媒体能力暴露给 JS 层
- [[buildroot]] —— 都涉及交叉编译和把 C/C++ 能力打包进受限设备
- [[openwrt]] —— 同属嵌入式/边缘设备语境，关注体积、架构和许可证

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
