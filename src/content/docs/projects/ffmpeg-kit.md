---
title: FFmpegKit — 在 App 里跑 FFmpeg 的「随身剪辑台」
来源: https://github.com/arthenica/ffmpeg-kit
日期: 2026-06-13
子分类: 嵌入式
分类: 操作系统
provenance: pipeline-v3
---

## 日常类比：把专业剪辑软件装进手机 App

想象你在手机里做短视频 App：用户上传一段 4K 视频，你要**压缩、裁切、加水印、混音、烧字幕**，最后导出 MP4。桌面端有 [[ffmpeg]] 这条命令行「瑞士军刀」，但手机 App 不能指望用户装终端、也不能随便 `fork` 一个 shell 进程。

**FFmpegKit 做的事，相当于在 App 里内置一台「随身剪辑台」**：底层仍是 FFmpeg 原生库，外面包一层各平台统一的 API（Java / Objective-C / Dart / JavaScript / C++），让你在 Android、iOS、Flutter、React Native 里直接写：

```text
-i input.mp4 -vf scale=720:-2 -c:v libx264 output.mp4
```

不用自己交叉编译 FFmpeg、不用处理 JNI/FFI、不用啃 C 头文件。项目地址：[arthenica/ffmpeg-kit](https://github.com/arthenica/ffmpeg-kit)，曾替代 MobileFFmpeg、flutter_ffmpeg、react-native-ffmpeg，GitHub 约 5.8k Stars。

**重要现状（2025 年起）**：官方已宣布 **FFmpegKit 退役（retired）**，仓库于 2025-06-23 归档只读，Maven/CocoaPods/pub/npm 上的预编译包也按版本分批下架。学习它仍有价值——大量存量 App、社区 fork 和「移动端如何封装 FFmpeg」的设计模式都建立在 FFmpegKit 之上；新项目需评估社区维护 fork 或自建 native 绑定。

---

## 解决什么问题

### 痛点 1：在移动端自己编译 FFmpeg 是地狱模式

FFmpeg 依赖链长（x264、libvpx、openssl…），Android 要配 NDK + ABI，iOS 要配 Xcode + bitcode/XCFramework，改一个 `--enable-*` 就要重编数小时。FFmpegKit 提供 **8 种预编译包**（min / https / audio / video / full 及对应 `-gpl` 变体），按功能选依赖体积。

### 痛点 2：命令行工具不适合直接嵌进 UI 线程

原生 `ffmpeg` 是阻塞式 CLI。FFmpegKit 用 **Session（会话）** 模型：每次 `execute` 创建会话，可同步等待，也可异步 + 日志/进度回调，还能 `cancel(sessionId)` 中断转码——这对「带进度条的导出」至关重要。

### 痛点 3：平台差异（SAF、摄像头、硬件编码）

- Android 10+ 分区存储：通过 `FFmpegKitConfig.getSafParameterForRead/Write` 把 SAF Uri 转成 FFmpeg 可读路径。
- iOS/macOS：可用 `avfoundation` 输入设备访问摄像头/麦克风，`VideoToolbox` 做硬件 H.264。
- 各平台字体目录、信号处理（Unity/Mono 需 `ignoreSignal`）都有封装。

### 痛点 4：探针与转码要同一套运行时

除了 `FFmpegKit.execute`，还有 `FFprobeKit` 跑 ffprobe，以及 `getMediaInformation()` 直接拿结构化元数据（时长、码率、流信息），避免自己解析 JSON。

---

## 核心概念

### 1. FFmpegKit vs FFmpeg

| 层次 | 是什么 | 你通常怎么用 |
|------|--------|--------------|
| **FFmpeg** | C 写的多媒体处理引擎 | 桌面/服务器命令行 |
| **FFmpegKit** | 预编译 FFmpeg + 跨平台封装库 | App 内 `execute("-i ...")` |
| **Session** | 一次命令执行的上下文 | 查 returnCode、logs、statistics |

FFmpegKit **不发明新滤镜语法**；你仍写标准 FFmpeg 参数，只是执行环境从 shell 变成 App 进程内的 native 库。

### 2. 八种预编译包（Package）

按「功能 vs 包体积 vs 许可证」选型：

| 包名 | 典型场景 | 备注 |
|------|----------|------|
| `min` | 仅基础转封装、简单滤镜 | 最小体积 |
| `https` | 拉取 HTTPS 远程流 | 含 gmp、gnutls |
| `audio` | 转 MP3/AAC/Opus 等 | 音频编解码器集 |
| `video` | 字幕、VP9、WebP、字体 | 无 GPL 编解码器 |
| `full` | 通用音视频处理 | 非 GPL 外部库较全 |
| `*-gpl` | 需要 **libx264/x265** 等 | 整包 GPL，分发需注意合规 |

默认 **LGPL 3.0**；启用 GPL 库后整包视为 GPL。专利敏感地区使用 x264/x265 前建议做法务评估（项目 Wiki 有 Patent 说明）。

### 3. Session 生命周期

每次 `FFmpegKit.execute(...)` 或 `executeAsync(...)` 产生一个 **FFmpegSession**：

```text
创建 → RUNNING → COMPLETED（成功/失败/取消）
```

可从 session 读取：

- `sessionId`：唯一 ID，用于 `FFmpegKit.cancel(id)`
- `returnCode`：`ReturnCode.isSuccess()` 判断是否成功
- `output` / `getLogs()`：控制台输出
- `getStatistics()`：转码进度（帧数、时间、比特率等），驱动 UI 进度条
- `duration`、`startTime`、`endTime`：性能与埋点

**同步**适合短命令（探针、截一张图）；**异步 + StatisticsCallback** 适合长转码，避免阻塞 UI。

### 4. Main Release vs LTS Release

两套发布线：

- **Main**：最新 SDK（Android API 24+）、摄像头、VideoToolbox、XCFramework。
- **LTS**：兼容老设备（Android API 16、旧 iOS），部分能力裁剪（如 LTS 上无 VideoToolbox）。

老项目维护选 LTS；新功能开发选 Main。

### 5. 支持平台与 API 表面

| 平台 | API 语言 | 依赖示例 |
|------|----------|----------|
| Android | Java/Kotlin | `com.arthenica:ffmpeg-kit-full:6.0-2` |
| iOS/macOS/tvOS | Objective-C / Swift 桥接 | CocoaPods `ffmpeg-kit-ios-full` |
| Flutter | Dart | `ffmpeg_kit_flutter_full` |
| React Native | TypeScript | `ffmpeg-kit-react-native` |
| Linux | C++ | 本地构建脚本 `linux.sh` |

各语言 API **能力对齐**：execute、executeAsync、FFprobe、MediaInformation、cancel、全局 log/statistics 回调。

### 6. 与纯 FFmpeg CLI 的能力边界

FFmpegKit 额外提供：

- 并发多 Session（注意内存与 CPU）
- 平台 SAF / 字体目录注册
- 结构化 `MediaInformation`（v5.1+ 重构了 property API）

仍 **不支持** 把 FFmpeg 变成无代码 UI 组件——滤镜、编码参数仍需你懂 FFmpeg 命令。

---

## 代码示例

### 示例 1：Android — 同步转码 + 判断结果

`build.gradle` 引入 full 包后：

```kotlin
import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.ReturnCode

fun transcodeToMpeg4(inputPath: String, outputPath: String): Boolean {
    val cmd = "-y -i $inputPath -c:v mpeg4 -q:v 5 $outputPath"
    val session = FFmpegKit.execute(cmd)

    return when {
        ReturnCode.isSuccess(session.returnCode) -> true
        ReturnCode.isCancel(session.returnCode) -> {
            // 用户或 FFmpegKit.cancel() 中断
            false
        }
        else -> {
            android.util.Log.e(
                "FFmpegKit",
                "state=${session.state} rc=${session.returnCode} ${session.failStackTrace}"
            )
            false
        }
    }
}
```

要点：

- `-y` 覆盖输出，避免交互式询问（移动端无 stdin）。
- `ReturnCode` 三分：成功 / 取消 / 失败，别只判 null。
- 失败时读 `failStackTrace` 和 `output`，比只看 returnCode 好排查。

### 示例 2：Flutter — 异步转码 + 进度回调

`pubspec.yaml`：

```yaml
dependencies:
  ffmpeg_kit_flutter_full: ^6.0.3
```

Dart 代码：

```dart
import 'package:ffmpeg_kit_flutter_full/ffmpeg_kit.dart';
import 'package:ffmpeg_kit_flutter_full/ffmpeg_kit_config.dart';
import 'package:ffmpeg_kit_flutter_full/return_code.dart';
import 'package:ffmpeg_kit_flutter_full/statistics.dart';

Future<bool> compressVideo({
  required String input,
  required String output,
  void Function(double progress)? onProgress,
}) async {
  // 720p + H.264，音频 copy（需 full-gpl 才有 libx264；此处示例用 mpeg4）
  final command =
      '-y -i "$input" -vf scale=1280:-2 -c:v mpeg4 -b:v 2M -c:a copy "$output"';

  final completer = Completer<bool>();

  await FFmpegKit.executeAsync(
    command,
    (session) async {
      final code = await session.getReturnCode();
      completer.complete(ReturnCode.isSuccess(code));
    },
    null,
    (Statistics stats) {
      // time 为毫秒（v6 起为 double）
      final ms = stats.getTime();
      onProgress?.call(ms / 1000.0); // 简化：用已处理时长作指示
    },
  );

  return completer.future;
}
```

要点：

- `executeAsync` 四参数：完成回调、日志回调（可 null）、统计回调。
- 长任务务必异步，在统计回调里更新 `CircularProgressIndicator`。
- 需要 **libx264** 时换 `ffmpeg_kit_flutter_full_gpl` 包，命令里 `-c:v libx264`。

### 示例 3：用 FFprobe 读媒体信息（跨平台思路）

不必手写 `ffprobe -print_format json`，可用高级 API：

```java
// Android / 同类 API 在 Apple、Flutter 上同名
MediaInformationSession session =
    FFprobeKit.getMediaInformation("/path/to/video.mp4");
MediaInformation info = session.getMediaInformation();
if (info != null) {
    String duration = info.getDuration();       // 秒，字符串
    String bitrate  = info.getBitrate();
    // v5.1+：getProperty("format", "nb_streams") 等
}
```

适合上传前校验：是否超过时长上限、是否含音频轨、分辨率是否超限。

### 示例 4：Android SAF — 用户从文件选择器选视频

```java
Uri safUri = intent.getData();
String input = FFmpegKitConfig.getSafParameterForRead(context, safUri);
String output = context.getCacheDir() + "/export.mp4";
FFmpegKit.executeAsync(
    "-i " + input + " -c:v mpeg4 " + output,
    session -> { /* 完成 */ },
    log -> { },
    statistics -> { }
);
```

没有 SAF 转换，FFmpeg 在 Android 10+ 上经常 **Permission denied**。

---

## 常见 FFmpeg 命令模板（在 FFmpegKit 里原样使用）

```bash
# 提取音频为 AAC
-i video.mp4 -vn -c:a aac -b:a 128k audio.m4a

# 截取 10~30 秒
-ss 10 -t 20 -i input.mp4 -c copy clip.mp4

# 烧录 SRT 字幕（需 video/full 包，libass）
-i video.mp4 -vf subtitles=sub.srt -c:a copy out.mp4

# 双路输出缩略图
-i input.mp4 -ss 00:00:05 -vframes 1 thumb.jpg

# HTTPS 拉流（需 https 包）
-i https://example.com/live.m3u8 -c copy -t 60 record.ts
```

在 App 里把路径换成沙盒目录或 SAF 参数；URL 注意证书与 GPL/https 包是否启用。

---

## 架构一图流

```text
┌─────────────────────────────────────────┐
│  你的 App（Kotlin / Swift / Dart / TS）   │
│  FFmpegKit.execute / FFprobeKit / Config  │
└──────────────────┬──────────────────────┘
                   │ Session + Callbacks
┌──────────────────▼──────────────────────┐
│  FFmpegKit Wrapper（Java/ObjC/Dart/…）    │
│  线程池、日志重定向、统计聚合、cancel      │
└──────────────────┬──────────────────────┘
                   │ JNI / FFI
┌──────────────────▼──────────────────────┐
│  预编译 FFmpeg + 选定的 external libs     │
│  libavcodec / libavformat / libswscale …  │
└──────────────────┬──────────────────────┘
                   │
         文件系统 / SAF / AVFoundation / MediaCodec
```

---

## 学习路径建议（零基础）

1. **先在桌面练 FFmpeg 命令**（30 分钟）：用官方 ffmpeg 对同一文件做 scale、截取、转码，确认参数有效。
2. **跑官方 Test App**：[ffmpeg-kit-test](https://github.com/arthenica/ffmpeg-kit-test) 各平台 Demo 一致，可看命令执行、并发、SAF 页。
3. **选最小包集成**：从 `min` 或 `video` 开始，确认 execute 通路，再按需升级到 `full` / `full-gpl`。
4. **先同步后异步**：短命令同步调通，再加 Statistics 回调。
5. **查许可证**：上架前确认 LGPL/GPL 义务与 x264 专利风险。

---

## 与其他方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| **FFmpegKit** | 多平台预编译、Session API 成熟、文档全 | 官方已退役，二进制下架 |
| **自编译 FFmpeg + JNI** | 完全可控、版本自选 | 维护成本极高 |
| **云端转码（S3 + Lambda/自建）** | App 轻、算力弹性 | 延迟、流量费、隐私 |
| **平台原生 API（AVAssetExportSession 等）** | 系统优化、合规简单 | 功能远少于 FFmpeg |
| **社区 fork（Maven/pub 搜 ffmpeg-kit）** | 延续预编译便利 | 需审计维护者与更新节奏 |

---

## 常见问题

**Q：FFmpegKit 还能用于新项目吗？**  
官方不再发布；可锁定历史版本、迁移社区 fork，或评估自维护 native 层。学习架构仍推荐读源码与 Wiki。

**Q：转码很慢怎么办？**  
优先硬件编码（iOS `h264_videotoolbox`、Android `h264_mediacodec`），降低分辨率与帧率，避免在 UI 线程同步 execute。

**Q：命令在桌面 ffmpeg 成功，在 App 里失败？**  
常见原因：路径无读权限、缺编码器（包太小）、GPL 编解码器未用 `-gpl` 包、输出目录不可写。

**Q：如何显示百分比进度？**  
用 `Statistics` 的 `time` 与 `MediaInformation` 里的总时长估算；或解析 `speed=` 日志。FFmpeg 本身不总给精确百分比。

**Q：和 [[vlc]] / ExoPlayer 关系？**  
播放器负责**解码播放**；FFmpegKit 侧重**离线处理管道**（转码、剪辑、混流）。可组合：FFmpegKit 导出 → ExoPlayer 播放。

---

## 小结

FFmpegKit 把「在服务器上跑的一条 ffmpeg 命令」搬到了 **手机、桌面、跨平台框架**里，用 Session、回调和预编译包屏蔽了 mobile 上最痛苦的编译与集成问题。核心记忆点：

1. **它还是 FFmpeg**——学会命令比学会 API 更重要。  
2. **按包选型**——min/https/audio/video/full/gpl 决定体积与能力。  
3. **Session 模型**——同步、异步、cancel、statistics 四条线理清。  
4. **平台细节**——SAF、字体、摄像头、硬件编码别忽略。  
5. **项目已退役**——学习价值在架构与存量维护，生产选型要另做供应链评估。

进一步阅读：[Wiki API](https://github.com/arthenica/ffmpeg-kit/wiki/API)、[Android 集成](https://github.com/arthenica/ffmpeg-kit/wiki/Android)、[退役说明](https://medium.com/@tanersener/saying-goodbye-to-ffmpegkit-33ae939767e1)、上游 [[ffmpeg]] 文档。
