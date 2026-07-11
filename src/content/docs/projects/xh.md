---
title: 'xh — HTTPie 的 Rust 重写版'
来源: https://github.com/ducaale/xh
日期: 2026-05-30
分类: CLI
难度: 入门
---

## 是什么

xh 是 Mohamed Dahir 在 2020 年用 Rust 写的**命令行 HTTP 客户端**，目标是"语法和 HTTPie 一样，但启动快 10 倍、单文件 5MB"。日常类比：

- **HTTPie**（[[httpie]]）：Python 写的"调 API 给人看的那一面"——彩色、JSON 缩进、`name=Alice` 这种短 DSL
- **xh**：把 HTTPie 的"用法 DSL"原封不动搬过来，把"运行时"换成 Rust——冷启动从约 100ms 降到约 5ms（社区 hyperfine 量级），二进制不依赖 Python

最小例子，与 HTTPie 主流写法一字不差：

```bash
xh POST https://api.example.com/users name=Alice age:=30 admin:=true
```

把命令里的 `http` 换成 `xh` 就能跑。装的时候顺便提供 `xhs`（默认 https）、可选 `http`/`https` 软链——纯习惯接管。

## 为什么重要

xh 在 CLI 工具链里**站住了"HTTPie 语法 + Rust 启动速度"这个细分位**：

- **约 6k stars**——比 HTTPie 小一个量级，但是"想保留 HTTPie 体感又嫌它慢"的人的常见答案
- **单二进制 ~5MB**：装 Docker / Alpine 基础镜像里不用拉 Python，工具链体积小一个数量级
- **冷启动约 5ms 量级**：CI 里循环发几百个请求，HTTPie 每次约 100ms 会累积成秒级；xh 几乎可忽略（见仓库 issue #45 社区 benchmark）
- **作者持续维护**：2020 首发到 2026，6 年稳定迭代，没出现 Rust 重写常见的"半路弃坑"

如果说 [[httpie]] 是"把 curl 改写成人话"，xh 就是"把人话再编译成机器速度"。

## 核心要点

xh 的心智模型可以拆成 **三层**：

1. **命令格式与 HTTPie 主流一致**：`xh [METHOD] URL [item ...]`——method 可省（默认 GET，**有 body 时自动 POST**），URL 必填，请求项跟在后面。读 HTTPie 文档就够用；插件与少数高级特性除外（见兼容性表）。

2. **请求项 DSL 完全继承**（类比：同一套"填表符号"）：

   | 分隔符 | 意义 | 例子 |
   |--------|------|------|
   | `=` | JSON 字段（字符串） | `name=Alice` |
   | `:=` | JSON 字段（**非字符串**） | `age:=30` |
   | `==` | URL query string | `page==2` |
   | `:` | HTTP header | `Authorization:Bearer xxx` |
   | `@` | 文件上传（multipart） | `avatar@./pic.png` |

3. **底层换骨**：用 Rust 生态里常见的发 HTTP（reqwest）、异步（tokio）、加密（rustls）库，替代 HTTPie 的 requests + urllib3。TLS 走 Rust 原生实现，不用挂 OpenSSL，进 Alpine / scratch 镜像零负担。

三条加起来就是它的全部——**会 HTTPie 主流用法就不用再学一套**。

## 实践案例

### 案例 1：调一个 GitHub API 看星数

```bash
xh https://api.github.com/repos/ducaale/xh
```

**逐部分解释**：

1. 没写 METHOD → 默认 GET
2. URL 指向仓库元数据接口 → 返回一段 JSON
3. xh 自动彩色 + 缩进打印；只要星数可再接 [[jq]]：`xh ... | jq '.stargazers_count'`

### 案例 2：CI 循环发 100 次请求（数量级示意）

```bash
# HTTPie：约 100ms × 100 ≈ 10s（冷启动累积）
for i in {1..100}; do http GET api.example.com/items/$i; done

# xh：约 5ms × 100 ≈ 500ms
for i in {1..100}; do xh GET api.example.com/items/$i; done
```

**逐部分解释**：

1. 循环本身一样，差在**每次进程冷启动**
2. 交互式单次请求体感往往差不多；差距在 CI / 脚本批量时才明显
3. 数字是教学量级，不是本机实测硬指标

### 案例 3：调 k8s API 后用 [[yq]] 取字段

只想看"请求头 + 响应体"，不要整页装饰输出时：

```bash
xh GET https://k8s.example.com/api/v1/namespaces \
  "Authorization:Bearer $TOKEN" \
  -p Hb | yq '.items[].metadata.name'
```

**逐部分解释**：

1. `"Authorization:Bearer $TOKEN"` 整段加引号，避免 shell 把空格拆坏
2. `-p Hb` 是 `--print` 简写：H = 请求头、b = 响应体
3. 管道交给 [[yq]] 抽命名空间名——xh 负责取数，解析交给专用工具

## 踩过的坑

1. **以为语法不同**：主流 DSL（`=` / `:=` / `==` / `:`）与 HTTPie 一致；别另起炉灶找"xh 专属语法"。
2. **CI 里没固定版本**：`cargo install xh` 不锁版本。CI 建议下 GitHub release 二进制并校验 sha256。
3. **不知道 `xhs` 是 https 默认**：`xhs api.example.com/x` 等价于 `xh https://api.example.com/x`。
4. **依赖 HTTPie plugin**：`httpie-oauth` / `httpie-aws-auth` 等 xh **不支持**，需要时退回 HTTPie。
5. **Windows 中文 JSON 乱码**：cmd 非 UTF-8 时先 `chcp 65001`，或改用 PowerShell。
6. **session 与 HTTPie 共用**：默认读写 `~/.config/httpie/sessions`，两边同时写可能竞争。

## 适用 vs 不适用场景

**适用**：
- CI / 脚本高频 API 调用（启动开销关键）——比 [[httpie]] 常快一个数量级
- 已习惯 HTTPie 语法但嫌冷启动慢（单次交互差异通常不明显）
- Docker / scratch 只装一个小体积 HTTP 工具（~5MB）
- shell 发请求 + [[jq]] / [[yq]] / [[dasel]] 解析

**不适用**：
- 依赖 HTTPie plugin 生态（OAuth、AWS sigv4）→ 用 [[httpie]]
- 需要 HTTP/3、QUIC、冷门协议 → curl 更全
- 团队完全不熟 HTTPie 语法 → 直接学 curl 更通用
- 极端老旧架构无 Rust 二进制 → 退 curl

## 历史小故事（可跳过）

- **2020-09**：Mohamed Dahir 发首版 0.1，定位"HTTPie compatible HTTP client"。
- **2021-2022**：stars 从约 1k 到 3k；社区补 session、cookie、`--download` 等高级特性。
- **2023**：安装扩展到 `brew` / `scoop` / `apt`，二进制下载稳定化。
- **2024-2026**：稳定在约 6k stars，成为"要 HTTPie 体感又要 Rust 启动"的常见推荐。

## 学到什么

1. **语法兼容是最廉价的护城河**——xh 复刻 HTTPie DSL，已会的人零学习成本。这种"协议层共享、实现层竞争"是 Unix 工具链的健康形态。
2. **重写老工具的两条路**——"改语法 + 改实现"（jq → [[yq]] / [[dasel]]）或"保语法 + 换运行时"（HTTPie → xh）。xh 选第二条，避开重学天花板。
3. **Rust CLI 的优势是单二进制 + 启动快**——Python / Node CLI 在 CI 循环里启动开销会累积；[[biome]]、ripgrep 也是同一规律。
4. **细分位够稳就够用**——不必 30k+ stars；占住"HTTPie 语法 + Rust 速度"并持续维护，就足以当默认推荐。

## 延伸阅读

- 仓库：[ducaale/xh](https://github.com/ducaale/xh)（README 一页，约 30 分钟通读）
- 与 HTTPie 差异：[xh 兼容性表格](https://github.com/ducaale/xh#how-xh-compares-to-httpie)
- 性能对比：[Hyperfine benchmark](https://github.com/ducaale/xh/issues/45)（社区冷启动数据）
- 安装：`cargo install xh` / `brew install xh` / GitHub release 二进制

## 关联

- [[httpie]] —— 语法源头；xh 是它的 Rust 重写
- [[jq]] —— `xh ... | jq '...'` 是调 JSON API 的标配
- [[yq]] —— 调 YAML API（k8s）时用它
- [[dasel]] —— 多格式选择器，输出格式不固定时用
- [[curlie]] —— 另一条"curl 能力 + HTTPie 语法"路线，可对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[curlie]] —— curlie — curl 的能力 + HTTPie 的语法
- [[httpie]] —— HTTPie — curl 的人话版本
