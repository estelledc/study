---
title: Jellyfin — 自托管媒体服务器
description: 自托管媒体服务器，转码、元数据刮削与多客户端同步
来源: 'https://github.com/jellyfin/jellyfin'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Jellyfin** 自托管媒体服务器，转码、元数据刮削与多客户端同步。

日常类比：像自家图书馆管理员：你放硬盘，它编目并推流到手机电视。

典型用法：克隆仓库读 README，跑官方最小示例，再对照源码目录理解模块边界。

## 为什么重要

- 学媒体库扫描与转码策略
- 理解 HLS/DASH 客户端分发
- 对照 [[ffmpeg]] 服务端转码
- 自建家庭影院技术栈

## 核心要点

1. **架构分层**：先分清 UI/核心库/IO 边界，再读入口 main。
2. **数据流**：跟踪一份输入如何变成输出（帧、包、tensor）。
3. **依赖**：看清系统库与第三方，避免装错环境。
4. **扩展点**：插件、配置、钩子在哪里暴露。
5. **运维**：日志、指标、崩溃复现路径。

## 核心架构

Jellyfin 基于 **.NET 8（ASP.NET Core）** 构建，整体分为以下层次：

### 后端架构

- **ASP.NET Core Web API**：RESTful API 服务，客户端（Web/App/SmartTV）均通过此 API 交互；Swagger 文档可在 `/api-docs` 访问。
- **媒体扫描器（Library Scanner）**：递归扫描媒体目录，对每个文件调用 `ffprobe` 提取流信息（编解码、分辨率、时长）；增量扫描只处理新增/修改文件。
- **元数据提供器（Metadata Providers）**：支持 TheMovieDB（TMDB）、TheTVDB、MusicBrainz 等在线数据库；本地 NFO 文件优先级最高；刮削器并发请求可在设置中调节。
- **转码引擎（Transcoding）**：调用 `ffmpeg` 进行按需转码；支持直接播放（Direct Play）、直接流（Direct Stream）、转码（Transcode）三种模式；`ffmpeg` 参数由 `EncodingHelper` 动态生成。
- **DLNA/UPnP**：内置 DLNA 服务器，智能电视可直接扫描发现 Jellyfin；基于 `Rssdp` 库实现 SSDP 发现。

### 转码与硬件加速

Jellyfin 支持多种 GPU 硬件加速编解码：

| 方案 | 平台 | 说明 |
|------|------|------|
| **NVENC/NVDEC** | NVIDIA GPU | `h264_nvenc`、`hevc_nvenc`；需 NVIDIA 驱动 + CUDA |
| **VAAPI** | Intel/AMD（Linux） | VA-API 开源驱动；Intel QSV 超快速 |
| **QSV** | Intel CPU/GPU | Quick Sync Video；低功耗 |
| **VideoToolbox** | Apple Silicon/Intel Mac | macOS 硬件加速 |
| **AMF** | AMD GPU（Windows） | Advanced Media Framework |

并发转码流数限制：在「管理」→「转码」中设置 `MaxSimultaneousTranscodingProcesses`，默认无限制；建议按 GPU VRAM 设置上限（每路 1080p 约占 500 MB VRAM）。

### 客户端生态

- **Web 客户端**：内置，基于 React；任意浏览器访问 `http://server:8096`
- **Jellyfin for Android/iOS**：官方 App
- **Jellyfin for Kodi**：Kodi 插件，整合本地播放器
- **Infuse（iOS/tvOS）**：第三方高性能客户端，支持杜比视界/Atmos

## 代码示例

### Docker 部署（推荐方式）

```yaml
# docker-compose.yml
version: "3"
services:
  jellyfin:
    image: jellyfin/jellyfin:latest
    container_name: jellyfin
    network_mode: host          # DLNA 发现需要 host 网络
    volumes:
      - /path/to/config:/config
      - /path/to/cache:/cache
      - /path/to/media:/media:ro
    restart: unless-stopped
    # GPU 透传（NVIDIA）
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

```bash
docker-compose up -d
# 访问 http://localhost:8096 完成初始化向导
```

### API 调用示例

```bash
# 获取 API Key（在管理界面创建）
API_KEY="your_api_key"
SERVER="http://localhost:8096"

# 查询媒体库列表
curl "$SERVER/Library/VirtualFolders" \
  -H "X-Emby-Authorization: MediaBrowser Token=$API_KEY"

# 触发媒体库扫描
curl -X POST "$SERVER/Library/Refresh" \
  -H "X-Emby-Authorization: MediaBrowser Token=$API_KEY"

# 搜索影片
curl "$SERVER/Items?searchTerm=Inception&includeItemTypes=Movie" \
  -H "X-Emby-Authorization: MediaBrowser Token=$API_KEY"
```

## 实践案例

### 案例 1：最小可运行

```bash
git clone <repo-url>
cd jellyfin
# 按官方文档安装依赖后运行 demo
```

对照 README 的参数表，改一个选项观察输出变化。

### 案例 2：读源码入口

从 `main` / `CMakeLists.txt` / `package.json` 找模块图；画一张三框数据流草图。

### 案例 3：与邻居项目对照

对照 [[ffmpeg]] 的实现差异：Jellyfin 在 ffmpeg 上层提供媒体库管理、元数据刮削、多客户端 UI；ffmpeg 负责底层转码，两者是典型的「厚库 + 薄壳」关系。

### 案例 4：NVIDIA GPU 转码配置

```bash
# 验证 NVIDIA 驱动和 ffmpeg 硬件加速是否可用
docker exec jellyfin ffmpeg -hwaccels
# 应显示 cuda, nvdec, nvenc 等

# 在 Jellyfin 管理界面：
# 播放 → 转码 → 硬件加速：NVIDIA NVENC
# 启用：硬件解码 H.264 / HEVC / AV1
```

### 案例 5：接入自己的管线

把输出接到下游（播放器、训练 DataLoader、会议客户端），记录延迟与格式约束。

### 案例 6：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` 打开同子类邻居 1 篇，检查实践案例是否覆盖安装/命令/排障。

## 踩过的坑

1. **依赖版本漂移**：按文档锁版本，否则编译失败难定位。
2. **VAAPI 权限问题**：Linux 下容器内需映射 `/dev/dri/renderD128`，并将用户加入 `render` 和 `video` 组。
3. **元数据刮削失败**：TMDB API Key 未配置、网络不通或文件命名不规范（如 `Movie.2023.mkv` 而非 `Movie (2023).mkv`）都会导致刮削失败。
4. **路径写死**：示例用绝对路径，换机器必挂。
5. **直接播放失败**：客户端不支持的编解码（如 HEVC Main 10 on Safari）会强制转码；可在客户端设置调高「最大流比特率」。
6. **DLNA 在 Docker bridge 网络失效**：SSDP 广播不穿越 Docker bridge，需用 `network_mode: host` 或单独配置 DLNA。
7. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。

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

- 官方仓库：https://github.com/jellyfin/jellyfin
- [[ffmpeg]]
- [[handbrake]]
- [[hls-js]]
- [[obs-studio]]
- [[decord]]

## 关联

- [[ffmpeg]] —— 同专题对照阅读
- [[handbrake]] —— 同专题对照阅读
- [[hls-js]] —— 同专题对照阅读
- [[obs-studio]] —— 同专题对照阅读
- [[decord]] —— 同专题对照阅读
- [[opencv]] —— 同专题对照阅读

## 维护备注

- 合并后运行 `npm run atlas` 刷新反向链接。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[ffmpeg]] —— FFmpeg — 多媒体转码与封装瑞士军刀
- [[handbrake]] —— HandBrake — FFmpeg 上的 GUI 转码器
- [[obs-studio]] —— OBS Studio — 开源直播录制与推流
- [[opencv]] —— OpenCV — 开源计算机视觉库与跨平台图像视频处理

