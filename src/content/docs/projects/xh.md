---
title: 'xh — HTTPie 的 Rust 重写版'
来源: https://github.com/ducaale/xh
日期: 2026-05-30
子分类: 命令行工具
分类: CLI
难度: 入门
---

## 是什么

xh 是 Mohamed Dahir 在 2020 年用 Rust 写的**命令行 HTTP 客户端**，目标是"语法和 HTTPie 一样，但启动快 10 倍、单文件 5MB"。日常类比：

- **HTTPie**（[[httpie]]）：Python 写的"调 API 给人看的那一面"——彩色、JSON 缩进、`name=Alice` 这种短 DSL
- **xh**：把 HTTPie 的"用法 DSL"原封不动搬过来，把"运行时"换成 Rust——冷启动从 100ms 降到 5ms，二进制不依赖 Python

最小例子，与 HTTPie 一字不差：

```bash
xh POST https://api.example.com/users name=Alice age:=30 admin:=true
```

把命令里的 `http` 换成 `xh` 就能跑。装的时候顺便提供 `xhs`（默认 https）、`http`/`https` 软链——纯习惯接管。

## 为什么重要

xh 在 CLI 工具链里**站住了"HTTPie 语法 + Rust 启动速度"这个细分位**：

- **6k stars**——比 HTTPie 小一个量级，但作为"想保留 HTTPie 体感又嫌它慢"的人的标准答案
- **单二进制 ~5MB**：装 Docker 镜像 / Alpine 基础镜像里不用拉 Python，整个工具链小一个数量级
- **冷启动 ~5ms**：CI 里循环发几百个请求，HTTPie 每次 100ms 累计就是分钟级；xh 几乎可以忽略
- **作者持续维护**：2020 首发到 2026，6 年稳定迭代，没出现 Rust 重写常见的"半路弃坑"

如果说 [[httpie]] 是"把 curl 改写成人话"，xh 就是"把人话再编译成机器速度"。

## 核心要点

xh 的心智模型可以拆成 **三层**：

1. **命令格式与 HTTPie 完全一致**：`xh [METHOD] URL [item ...]`——method 可省（默认 GET，**有 body 时自动 POST**），URL 必填，请求项跟在后面。读 HTTPie 文档就够了。

2. **请求项 DSL 完全继承**：

   | 分隔符 | 意义 | 例子 |
   |--------|------|------|
   | `=` | JSON 字段（字符串） | `name=Alice` |
   | `:=` | JSON 字段（**非字符串**） | `age:=30` |
   | `==` | URL query string | `page==2` |
   | `:` | HTTP header | `Authorization:Bearer xxx` |
   | `@` | 文件上传（multipart） | `avatar@./pic.png` |
   | `=@` | 从文件读 JSON 字符串值 | `bio=@./bio.txt` |

3. **底层换骨**：reqwest + tokio + rustls 替代 HTTPie 的 requests + urllib3。所有 TLS 走 Rust 原生实现，不用挂 OpenSSL，进 Alpine / scratch 镜像零负担。

三条加起来就是它的全部——**学过 HTTPie 不用再学一次**。

## 实践案例

### 案例 1：调一个 GitHub API 看星数

```bash
xh https://api.github.com/repos/ducaale/xh
# 自动彩色 + JSON 缩进，与 HTTPie 输出几乎一致
```

只想看一个字段？接 [[jq]]：

```bash
xh https://api.github.com/repos/ducaale/xh | jq '.stargazers_count'
```

### 案例 2：CI 循环发 100 次请求

```bash
# HTTPie 版本：每次冷启动 100ms × 100 = 10s
for i in {1..100}; do http GET api.example.com/items/$i; done

# xh 版本：每次 5ms × 100 = 500ms
for i in {1..100}; do xh GET api.example.com/items/$i; done
```

差距在交互式调试时不明显，进了 CI 循环就是肉眼可见的省时间。

### 案例 3：调 k8s API 后用 [[yq]] 取字段

```bash
xh GET https://k8s.example.com/api/v1/namespaces \
  Authorization:"Bearer $TOKEN" \
  -p Hb | yq '.items[].metadata.name'
```

`-p Hb` 是 HTTPie 的 `--print` 简写：H = request header、b = response body。

### 案例 4：配 [[dasel]] 处理混合格式

```bash
# 接口同时返回 XML / JSON 时
xh GET api.example.com/data | dasel -r json '.items.[0].name'
```

## 踩过的坑

1. **以为语法不同**：xh 的语法**与 HTTPie 完全一致**——`=` 字符串、`:=` 非字符串、`==` query。读 HTTPie 文档够用，别另起炉灶找 xh 文档。

2. **CI 里没固定版本**：`cargo install xh` 不锁版本，`brew install xh` 跟 brew 走。CI 里建议直接下载 GitHub release 二进制并校验 sha256。

3. **不知道 `xhs` 是 https 默认**：`xhs api.example.com/x` 等价于 `xh https://api.example.com/x`——少打 5 个字符。

4. **依赖 HTTPie plugin 的场景**：HTTPie 有 `httpie-oauth` `httpie-aws-auth` 等插件生态，xh **完全不支持**。需要这些时退回 HTTPie。

5. **Windows 终端中文 JSON 乱码**：默认 cmd 编码非 UTF-8。`chcp 65001` 切一次，或在 PowerShell 里跑。

6. **session 文件位置兼容**：xh 默认读写 `~/.config/httpie/sessions`，**和 HTTPie 共用 cookie**——好处是无缝切换，坏处是两边操作同一文件可能竞争。

## 适用 vs 不适用场景

**适用**：
- CI 高频 API 调用（启动开销关键）——比 [[httpie]] 快 10-20×
- 已经习惯 HTTPie 语法但嫌它启动慢
- Docker / scratch 镜像只装一个 HTTP 工具且要小（~5MB）
- shell 脚本里发请求 + 配 [[jq]] / [[yq]] / [[dasel]] 解析

**不适用**：
- 依赖 HTTPie plugin 生态（OAuth、AWS sigv4、自定义 formatter）→ 用 [[httpie]]
- 需要 HTTP/3、QUIC、奇怪协议 → curl 更全
- 团队成员完全不熟 HTTPie 语法 → 直接学 curl，通用性更强
- 极端老旧架构无 Rust 二进制 → 退 curl

## 历史小故事（可跳过）

- **2020-09**：Mohamed Dahir 在 GitHub 发首版 0.1，定位"HTTPie compatible HTTP client"，不藏目标。
- **2021-2022**：从 1k 涨到 3k stars，社区贡献者补全 session、cookie 持久化、`--download` 等 HTTPie 高级特性。
- **2023**：默认安装方式从 `cargo install` 扩展到 `brew` / `scoop` / `apt`，二进制下载稳定化。
- **2024-2026**：稳定在 6k stars，被多个 Rust 工具链文档（reqwest、actix-web 调试章节）当默认 HTTP CLI 推荐。

## 学到什么

1. **语法兼容是最廉价的护城河**——xh 没发明一套新 DSL，直接复刻 HTTPie。结果是已会 HTTPie 的人零学习成本，文档也不用重写。这种"协议层共享、实现层竞争"是 Unix 工具链的健康形态，[[httpie]] 笔记里也提过。

2. **重写老工具的两条路**——要么"改语法 + 改实现"（jq → [[yq]] / [[dasel]]，多格式扩展），要么"保语法 + 换运行时"（HTTPie → xh，纯性能优化）。xh 选第二条，避开了"用户要不要重学"的天花板。

3. **Rust 在 CLI 工具链的优势是单二进制 + 启动快**——Python / Node 写的 CLI 在 CI 循环里启动开销累积是常见痛点。Rust 同时拿掉运行时依赖和冷启动，进 Alpine 镜像格外舒服。这条规律在 [[biome]]（替代 ESLint+Prettier）、ripgrep（替代 grep）也成立。

4. **6k stars 不算多但够稳**——CLI 细分工具不一定要 30k+ 才有生态价值。占住"HTTPie 语法 + Rust 速度"这个细分位，加上作者持续维护，就足够当默认推荐。

## 延伸阅读

- 仓库：[ducaale/xh](https://github.com/ducaale/xh)（README 一页，30 分钟通读）
- 与 HTTPie 差异：[xh 兼容性表格](https://github.com/ducaale/xh#how-xh-compares-to-httpie)（哪些不支持一目了然）
- 性能对比：[Hyperfine benchmark](https://github.com/ducaale/xh/issues/45)（社区跑的冷启动数据）
- 安装：`cargo install xh` / `brew install xh` / GitHub release 直接下二进制

## 关联

- [[httpie]] —— 语法源头；xh 是它的 Rust 重写
- [[jq]] —— `xh ... | jq '...'` 是调 JSON API 的标配
- [[yq]] —— 调 YAML API（k8s manifest）时用它
- [[dasel]] —— 多格式选择器，xh 输出格式不固定时用它一把切

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[curlie]] —— curlie — curl 的能力 + HTTPie 的语法
- [[dasel]] —— dasel — 一把刀同时切 JSON / YAML / TOML / XML / CSV
- [[httpie]] —— HTTPie — curl 的人话版本
- [[jq]] —— jq — JSON 的 sed/awk

