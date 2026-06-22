---
schema_version: 6
lens: media-storage
lens_id: media-storage
title: lens-media-storage
domain: lens
layer: app
status: active
owner: jason
verified_at: 2026-05-31
review_quarter: 2026Q2
total_budget_chars: 3000
hardware_assumption: 教学/工具站；50-500 段≤10min 视频；月播 10-1000GB；预算<$200/月起步；要自有域名+换 origin 自由；国内走 CN-friendly CDN
ring_summary: { adopt: 9, trial: 5, assess: 1, hold: 2 }
excludes: [glossary, sources+reading_list, getting_started, what_is_not]
wikilinks: [azure-storage-2011, gfs, ovenmediaengine, sharp, http-2, tls-1.3, nginx]
out_of_corpus: [cloudflare-r2, s3, backblaze-b2, aliyun-oss, bunny-stream, cloudflare-stream, mux-video, ffmpeg, cloudflare-cdn, bunny-cdn, cloudfront, aliyun-cdn, hls-rfc-8216, cmaf-ll-hls, webrtc, next-image]
provider_coverage_checklist:
  - AWS S3（origin 工具链最全 / egress 0.09 美元）
  - Cloudflare R2（S3 兼容 / egress 0 / 与 CF 同栈）
  - Mux Video（API+DRM+分析最专业 / 单价高）
  - Cloudflare Stream（CF 同栈 / 按分钟+按交付）
  - Bunny Stream（点播总价最低 / 含播放器）
  - BunnyCDN / 又拍 / 阿里云 CDN
sources:
  - Cloudflare R2 / Stream pricing
  - Mux pricing / Bunny Stream / BunnyCDN pricing
  - AWS S3 pricing / Backblaze B2 + CF Bandwidth Alliance
  - RFC 8216 HLS / Apple HLS Authoring 2023
  - ISO/IEC 23009-1 DASH
open_questions:
  - HLS vs DASH 国内 CDN 边缘命中与 ABR 切换稳定性缺 2025 实测
  - R2 egress=0 在跨区域+非 CF CDN 真实带宽限速无明示
  - Bunny Stream 50×10min 点播月费随码率波动区间需实测
  - signed URL+token+Referer+设备指纹 漏报率社区缺
  - 国内 CDN 商务谈判后真实差价未知
---

## 候选表

verified 2026-05-31。layer 全=app。OOG=industry-vendor，study/ 不收纸的服务/标准。

| 候选 | ring | 立场 | 触发条件 | layer |
|---|---|---|---|---|
| R2 | adopt | R2: egress=0 默认 origin | 月播>50GB | app |
| S3 | adopt | S3: 工具链最广 | 已锁 AWS | app |
| B2 | trial | B2: 冷数据最便宜 | 配 CF 联盟 | app |
| OSS | adopt | OSS: 国内必选 | 备案合规 | app |
| Bunny Stream | adopt | Bunny: 点播总价最低 | MVP 成本敏感 | app |
| CF Stream | trial | CF Stream: CF 栈零摩擦 | CF 重度 | app |
| Mux Video | trial | Mux: 付费+DRM 专业 | 单价可担 | app |
| 自托 ffmpeg | adopt | 自托: 控制权拉满 | >5000min 或自管 DRM | app |
| CF CDN | adopt | CF CDN: R2 联动 0 egress | 默认起点 | app |
| BunnyCDN | adopt | BunnyCDN: 亚太每 GB 最低 | 与 R2/B2 联动 | app |
| CloudFront | hold | CloudFront: 锁 AWS 才看 | SCP 强制 | app |
| 又拍/阿里 | adopt | 又拍/阿里: 国内必挂 | 国内>30% | app |
| next/image | adopt | next/image: Next 默认 | 构建+运行期 | app |
| HLS | adopt | HLS: 点播事实标准 | iOS 原生 | app |
| LL-HLS | trial | LL-HLS: 直播<5s | 延迟敏感 | app |
| WebRTC | adopt | WebRTC: 互动<500ms | 双向直播 | app |

hold：GCS / imgix。assess：Thumbor 自托。

## ADR 索引

**ADR-1 视频管线 Bunny Stream vs 自托 ffmpeg+R2** (vendor-selection)

### context
50 段、月播 100-500GB，需 ABR+自有域名。Bunny 0.005/min+0.005-0.04/GB；自托=R2+ffmpeg+CF egress 0。

### decision
MVP→Bunny；>5000 min 或自管 DRM→自托 ffmpeg+R2+CF。

### alternatives
Mux（拒：单价 2-3×）；CF Stream（拒：交付贵于 Bunny）；一上来自托（拒：拖 MVP>1 周）。

### consequences
Bunny 1h 上手、月费<$30；播放器 UI 受限。回滚：m3u8 origin 切 Bunny CDN URL。

**ADR-2 origin 选 R2** (vendor-selection)

### context
egress 是大头。S3+CloudFront≈$42/500GB；R2 egress=0+存储 0.015/GB-月。

### decision
默认 R2；S3-only SDK 不兼容时回 S3。

### alternatives
S3（拒：egress 数倍）；B2（拒：仅冷备工具链弱）；OSS（拒：国内主战场才主选）。

### consequences
省 egress；Class A 单价略高、multi-region 控制弱。回滚：SDK endpoint 一行切。

**ADR-3 HLS 分片 hls_time 调优** (implementation-tuning)

### context
RFC 8216+Apple 2023 推 6s；点播倾 10s；直播倾 2-4s；弱网短分片助 ABR。

### decision
hls_time = 6, gop_size = 2, ll_hls_part_target = 1（仅直播开）。

### rationale
6s 标准+iOS 兼容；GOP=2 让 ABR 在 2s 边界切；LL-HLS 仅直播避免 m3u8 频更。

### consequences
首片~6s；请求数/GB 最少；改 ffmpeg `-hls_time` 一参+重转码。监控 iOS 首帧+Android rebuffer。

**ADR-4 付费课 DRM vs signed URL** (architecture)

### context
signed URL 挡随手分享、挡不住 yt-dlp 拼 ts。DRM 才挡硬下、要 license+EME。

### decision
免费/低价→signed URL+Referer+5min token；高价(>$200)→Mux DRM 或 CF Stream signed manifest。

### consequences
signed URL 1 天落地挡 80%；DRM 成本翻倍+Linux/老 Android 播不动。

### rollback
盗版损失<DRM 总成本时撤 DRM，重转码无加密版本，提前留无加密源文件。

## 决策树

```
Q0 cost-gate：月播<100GB 且 月预算<$50?
  Y→R2+Bunny+CF 免费档（跳 Q5）
  N→Q1
Q1 直播/点播？
  直播→互动<500ms? Y→WebRTC / N→LL-HLS+CMAF 4s（ADR-3）
  点播→Q2
Q2 需 DRM？ Y→Mux DRM/CF signed manifest（ADR-4） / N→signed URL+token+Referer
Q3 需 ABR（弱网>20%）? Y→HLS 多码率 Bunny/自托 ffmpeg（ADR-1） / N→单码率 mp4+range
Q4 要前端可控播放器？ Y→自托 hls.js+R2 / N→Bunny/Mux/CF iframe
Q5 国内>30%? Y→加挂又拍/阿里+OSS / N→CF+Bunny 全球
```

## 外迁 excludes

- sources/media-storage.md
- reading_list/media-storage.md
- getting_started/media-storage.md
- what_is_not/media-storage.md
