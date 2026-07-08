---
title: FLAC — 无损音频压缩事实标准
来源: 'https://github.com/xiph/flac'
日期: 2026-07-08
分类: media
难度: 初级
---

## 是什么

FLAC 是一套把音频文件压小、但不丢掉任何声音信息的格式和参考实现。日常类比：像把衣服真空压缩进袋子，拿出来还是原来的衣服；MP3 更像把不显眼的线头剪掉，听起来可能差不多，但已经不是原件。

它的名字是 Free Lossless Audio Codec，重点在 **Lossless**：解码回 PCM 后，音频采样应该和原始输入一致。GitHub 仓库里同时放了格式相关实现、`libFLAC` 库、`flac` 命令行工具、`metaflac` 元数据工具和示例代码。

最小用法不是写程序，而是把一个 WAV 压成 FLAC：

```bash
flac -V music.wav
```

这里 `-V` 表示边编码边校验：编码完再解码一遍，确认压缩包里的声音能还原回原始采样。

## 为什么重要

不理解 FLAC，下面这些事会很难解释：

- 为什么音乐归档常说“先保留无损母版”，再按场景转 MP3、AAC 或 Opus。
- 为什么同样叫“音频压缩”，FLAC 和 MP3 的工程目标完全不同。
- 为什么媒体播放器、转码器、唱片抓轨工具都愿意支持 `.flac`，它像一份能互通的无损中间格式。
- 为什么音频文件里除了声音，还有封面、标签、cue、seek table、foreign metadata 这些“随身文件夹”。

## 核心要点

1. **无损压缩**：FLAC 不尝试猜“人耳听不到什么”，而是寻找 PCM 采样里的规律。类比：记账本里连续很多天金额差不多，就记录“基准 + 差值”，不是把某几天删掉。

2. **参考实现**：`xiph/flac` 不只是一个工具仓库，也提供 `libFLAC` 和 `libFLAC++`。类比：既给你成品电饭锅，也给厂商可嵌进自己厨房的加热模块。

3. **容器和元数据分开看**：声音数据、校验信息、标签、封面、seek table 各自有位置。类比：一本相册里照片是主体，封面、目录和便签能帮助查找，但不应该改变照片本身。

## 实践案例

### 案例 1：把 WAV 归档成 FLAC

官方 `flac` 手册的典型任务里，最常见的是从未压缩音频编码到 `.flac`：

```bash
flac -V --best abc.wav
```

逐部分解释：

- `flac` 默认是在“编码”，所以不用额外写 `--encode`。
- `--best` 选择最高压缩预设，通常更慢，目标是文件更小。
- `-V` 让工具内部解码校验，适合做长期归档时多花一点时间买安心。

如果只是日常压缩，可以用默认级别：

```bash
flac abc.wav
```

默认会生成 `abc.flac`，原始 `abc.wav` 不会被删除，除非显式加 `--delete-input-file`。

### 案例 2：把 FLAC 解回 WAV 或只做健康检查

解码时要明确告诉工具“现在我要还原”，因为 `flac abc.flac` 默认仍会被理解成重新编码：

```bash
flac --decode abc.flac
flac -d abc.flac
```

逐部分解释：

- `--decode` 和 `-d` 是同一件事：把 `.flac` 解成 `.wav`。
- 如果 `abc.wav` 已经存在，默认不会覆盖，避免误删已有文件。
- 如果只想确认文件没坏，不想产生 WAV，可以用测试模式：

```bash
flac -t abc.flac
```

测试模式像拆快递前先摇一摇盒子：它检查码流和 MD5，但不把内容真的倒出来。

### 案例 3：用 metaflac 管理标签和校验信息

官方 `metaflac` 手册把它定位成 `.flac` 元数据编辑器。比如查看三首歌的 STREAMINFO MD5：

```bash
metaflac --show-md5sum file1.flac file2.flac file3.flac
```

逐部分解释：

- `metaflac` 不重编码音频，主要改或读元数据块。
- `--show-md5sum` 读取 STREAMINFO 里的音频校验指纹。
- 一次给多个文件时，输出会带文件名，适合脚本批量核对。

再比如清理历史遗留标签，同时保留文件修改时间：

```bash
metaflac --preserve-modtime --remove-tag=DESCRIPTION --remove-tag=COMMENT album.flac
```

这类操作适合“整理唱片柜标签”，不适合拿来改变声音内容。

## 踩过的坑

1. **把 FLAC 当成 MP3 的更高码率版**：错在目标不同，FLAC 追求可逆，MP3/AAC/Opus 多数场景追求听感和体积平衡。

2. **忘记 `-d` 就解码 `.flac`**：`flac abc.flac` 仍是编码路径，工具会尝试重压缩同名输出，容易让新人困惑。

3. **以为 `--best` 一定值得**：最高压缩常常只是多省一点空间，却花更多 CPU，批量归档前要先试几首。

4. **用标签选项重编码已有 FLAC**：`flac -T` 重新编码时可能覆盖原标签，日常改标签更应该用 `metaflac`。

## 适用 vs 不适用场景

**适用**：

- 做音乐、采访、采样库、游戏音效的无损归档。
- 在媒体流水线里当“干净中间件”，之后再转成 AAC、Opus 或 MP3。
- 需要播放器广泛支持，又希望比 WAV/AIFF 省空间。
- 嵌入式或播放器开发，需要用 `libFLAC` 直接解码音频流。

**不适用**：

- 极限省流量的在线分发：此时 Opus、AAC、MP3 更合适。
- 只处理已经有损的源文件：MP3 转 FLAC 不会把丢掉的细节变回来。
- 需要视频封装和字幕轨道的场景：用 Matroska、MP4 或完整媒体框架更自然。
- 想靠“无损”自动提升音质：FLAC 只能保真，不能修复差录音。

## 历史小故事（可跳过）

- 早期 FLAC 由 Josh Coalson 创建，后来由 Xiph.Org 社区继续维护，仓库里的示例代码仍保留这段版权脉络。
- GitHub README 把它称作 FLAC reference implementation，也就是很多软件对照实现和兼容性的基准。
- 仓库现在包含 C、C++ 库、命令行程序、man 文档、Doxygen API 文档和测试材料入口。
- 到 2026 年 7 月，GitHub 页面显示约 2.3k stars；最新 release 页面显示 1.5.0 在 2025 年发布。
- 这类项目的价值不在“每天换新 API”，而在多年后旧文件仍能被新播放器稳定打开。

## 学到什么

- 无损压缩的核心不是“听起来差不多”，而是“解回来一样”。
- 一个成熟媒体项目通常同时提供命令行、库、格式约定、测试文件和文档。
- 元数据是音频工程里的第二条线：声音要准，标签、封面、seek 和来源信息也要可维护。
- FLAC 的工程美感在保守：少一点炫技，多一点长期兼容。

## 延伸阅读

- 官方仓库：[xiph/flac](https://github.com/xiph/flac)（README 说明组件、构建方式和文档位置）
- 命令行手册：[man/flac.md](https://github.com/xiph/flac/blob/master/man/flac.md)（编码、解码、测试、分析的真实命令）
- 示例代码：[examples/](https://github.com/xiph/flac/tree/master/examples)（C / C++ 版 libFLAC 编码和解码示例）
- [[ffmpeg]] —— 常用媒体转码入口，实际项目里经常调用 FLAC 编解码器。
- [[opus]] —— 同属音频编码世界，但目标是高质量有损和低延迟传输。

## 关联

- [[ffmpeg]] —— FLAC 常被放进更大的转码流水线里处理。
- [[gstreamer]] —— 媒体管线框架，需要把 FLAC 当成一种可插拔 codec。
- [[handbrake]] —— 转码工具场景里会遇到“保留无损还是转有损”的取舍。
- [[fdk-aac]] —— AAC 是常见有损分发格式，和 FLAC 的归档定位互补。
- [[opus]] —— Opus 更适合实时通信和网络分发，FLAC 更适合母版保存。
- [[lame]] —— MP3 编码器代表，帮助对比“有损压缩”和“无损压缩”。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
