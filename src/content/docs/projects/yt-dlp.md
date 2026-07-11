---
title: yt-dlp — 统一多站点下载器 CLI
来源: 'https://github.com/yt-dlp/yt-dlp'
日期: 2026-07-08
分类: media
难度: 中级
---

## 是什么

yt-dlp 是一个 **命令行音视频下载器**：你给它网页 URL，它按站点规则找到可下载格式，再落盘成文件。它是 youtube-dl 的活跃分支（经 youtube-dlc），覆盖**上千站点**。

日常类比：像一本**可扩展的抓取字典**——每个站点一页「怎么取流」的说明书；你报站名和参数，它按规则把媒体拿回来。

最小例子：

```bash
yt-dlp "https://www.youtube.com/watch?v=VIDEO_ID"
```

默认会选较优画质；合并分离的音视频轨通常需要本机有 [[ffmpeg]]。
一句话：把「打开网页找下载按钮」变成可脚本化的统一入口。

## 为什么重要

不理解 yt-dlp，下面这些事很难讲清：

- 为什么视频来源分散、协议常变，脚本却仍能用**同一条命令**归档多站内容
- 为什么下载常要同时处理字幕、封面、元信息和音视频分离——浏览器「另存为」做不到
- 它和 [[streamlink]] 都「给 URL 出媒体」，但一个偏**点播归档 + 后处理**，一个偏**直播实时管道**
- 为什么社区更新速度决定工具生死——站点一改版，extractor 就要跟，停更等于失效

## 核心要点

1. **Extractor 按站点适配**。类比：不同快递柜要不同开箱 App。每个 extractor 负责解析该站的页面/API，吐出格式列表与下载地址；站点改版时主要改这一层。

2. **Format selector 选轨再合并**。类比：点菜时分别点「画面」和「声音」，再让厨房拼盘。常见写法 `-f "bv*+ba/b"`：优先最佳视频+最佳音频，失败则回退到一体格式；合并靠 ffmpeg。

3. **后处理与输出模板**。类比：货到了还要贴标签、拆包装。`--write-subs`、`-x`（抽音频）、`-o` 模板可把标题/上传者写进文件名，方便媒体库索引。

## 实践案例

### 案例 1：下载并指定 1080p MP4

```bash
yt-dlp -f "bv*[height<=1080]+ba/b" \
  --merge-output-format mp4 \
  -o "%(title)s.%(ext)s" \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

**逐部分解释**：

- `-f`：格式选择表达式；`height<=1080` 限制最高 1080p
- `bv*+ba`：分别下视频轨与音频轨；`/b` 是回退
- `--merge-output-format mp4`：合并后封装为 mp4（需 ffmpeg）
- `-o`：用标题当文件名，避免一堆无意义 ID

### 案例 2：拉字幕并嵌入（或旁路落盘）

```bash
yt-dlp --write-subs --sub-langs "zh-Hans,en" --embed-subs \
  -o "%(title)s.%(ext)s" \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

**逐部分解释**：

- `--write-subs`：写出字幕文件；`--sub-langs` 限定语种
- `--embed-subs`：把字幕嵌进容器（部分格式支持）
- 只要文本、不要嵌：去掉 `--embed-subs`，保留 `.vtt`/`.srt` 给索引脚本

### 案例 3：批量 playlist，统一命名落盘

```bash
yt-dlp -f "bv*+ba/b" \
  -o "%(playlist_title)s/%(playlist_index)03d-%(title)s.%(ext)s" \
  --download-archive done.txt \
  "https://www.youtube.com/playlist?list=PLAYLIST_ID"
```

**逐部分解释**：

- `-o` 里的 `playlist_index` 保证顺序；目录按播单名分文件夹
- `--download-archive`：已成功的 ID 记入文件，重跑跳过，适合增量归档
- 网络抖动可加 `--retries 10`；会员内容常需 `--cookies-from-browser chrome`

## 踩过的坑

1. **没带 cookie / UA 就撞风控**：登录墙或年龄限制下，游客请求直接失败。原因：站点要浏览器登录态，CLI 默认没有。

2. **格式选错导致只有画面或音画不同步**：只下了视频轨、或合并失败。原因：许多站默认分离轨；缺 ffmpeg 或 `-f` 写错时不会自动「修好」。

3. **忽视版权与站点 ToS**：技术上能下 ≠ 法律上能用。原因：工具不替你做授权判断，商用/再分发前必须确认许可。

4. **未设重试与归档，批量任务一抖就断**：长 playlist 中途失败后从头重来。原因：默认对瞬时网络错误不够「死磕」；`--retries` + `--download-archive` 才稳。

## 适用 vs 不适用

**适用**：

- 多站点点播素材的统一下载入口与自动化归档
- 需要字幕、封面、元信息一并落盘的媒体库整理
- 脚本化批量 playlist / 频道增量同步（配合 archive 文件）
- 本机已有 Python/ffmpeg，想把下载嵌进流水线

**不适用**：

- 严格合规环境且未获授权——先确认版权与 ToS，再谈工具
- 只要偶尔下 1–2 个公开视频——浏览器扩展可能更轻
- 低延迟直播边看边录——优先 [[streamlink]]
- 需要实时互动弹幕/打赏 UI——它只归档媒体，不复刻网站

## 历史小故事（可跳过）

- **youtube-dl 时代**：社区用一套 extractor 框架对抗「每站一套下载逻辑」。
- **维护压力与分支**：上游节奏跟不上站点改版时，出现 youtube-dlc 等更活跃分支。
- **yt-dlp 合流**：在 youtube-dlc 基础上继续演进，补上更快的默认行为、更强的 format 选择与后处理。
- **与直播工具分家**：同一时期 Streamlink 守住直播管道；yt-dlp 把点播下载与元数据做到极致——两者常被一起装。
- **持续跟站**：issue 区大量「某站挂了」；活跃度本身就是产品功能的一部分。

## 学到什么

1. **「页面」和「文件」要拆开想**——用户看见 HTML，归档要的是格式列表与字节流；中间这层值得独立成工具。
2. **适配层 = 产品边界**——支持哪些站，几乎完全取决于 extractor 是否跟上。
3. **选轨 + 后处理是一等公民**——下载器不只是「存文件」，还要会合并、嵌字幕、按模板命名。
4. **同类工具按场景选型**——点播归档用 yt-dlp，直播管道用 streamlink，转封装用 ffmpeg。

## 延伸阅读

- [yt-dlp GitHub](https://github.com/yt-dlp/yt-dlp)（Unlicense；安装与 release）
- [Usage and Options](https://github.com/yt-dlp/yt-dlp#usage-and-options)（`-f`、字幕、cookie 等）
- [Format Selection](https://github.com/yt-dlp/yt-dlp#format-selection)（`bv*+ba` 表达式）
- [FAQ Wiki](https://github.com/yt-dlp/yt-dlp/wiki/FAQ)（常见失败与站点问题）
- [[streamlink]] —— 直播取流与本地播放/录制
- [[ffmpeg]] —— 合并、转封装与后处理依赖

## 关联

- [[streamlink]] —— 同属「URL → 媒体」，但偏直播管道而非点播归档
- [[ffmpeg]] —— 分离轨合并、转封装、抽音频的常见后端
- [[gstreamer]] —— 更底层的多媒体管道；yt-dlp 是应用层下载器
- [[dav1d]] —— 解码侧常见搭档；下载下来的 AV1 内容常经它播放/转码
- [[shotcut]] —— 归档后的剪辑入口之一
- [[nginx-rtmp-module]] —— 自建推流/点播服务端；和「从别人网站下载」方向相反

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
