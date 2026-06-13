---
title: Maigret — 仅凭用户名跨站 OSINT 画像收集
来源: https://github.com/soxoj/maigret
日期: 2026-06-13
子分类: 安全与隐私
分类: 安全与隐私
provenance: pipeline-v3
---

## 是什么

**Maigret**（[soxoj/maigret](https://github.com/soxoj/maigret)，PyPI 包名 `maigret`）是一个 Python OSINT 工具：你只给一个**用户名（或别名）**，它会在数千个网站的公开 URL 模式里批量探测「这个昵称是否已注册」，并从命中页面的 HTML / 开放接口里**抽取个人资料、外链账号、ID** 等元数据，最后汇总成可下载的报告。

日常类比：

- **电话簿翻页 vs 全网搜昵称**：老式 OSINT 像在一本厚电话簿里按姓氏查号；Maigret 像雇了一支**并行跑腿队**——同时去 GitHub、Reddit、摄影站、论坛、各国社交站问「有没有叫 `johndoe` 的公开主页」，谁回「有」，就把那页的公开信息抄回来。
- **侦探的「化名档案」**：真实调查里，嫌疑人可能用同一网名在不同平台活动。Maigret 做的是**化名关联**：不碰密码、不破解登录，只在**无需 API Key 的公开页面**上比对「用户名是否存在」并收集页面上已经写明的简介、头像链接、@ 其他账号等线索。
- **Sherlock 的加强版**：Maigret _fork_ 自著名的 [Sherlock](https://github.com/sherlock-project/sherlock) 项目，但扩展了站点库（3000+）、资料解析、递归搜索、标签过滤、Web UI、多格式报告，以及可选的 AI 摘要（`--ai`）。

最小上手：

```bash
# 安装（需要 Python 3.10+，官方推荐 3.11）
pip install maigret

# 默认：在流量排名前 500 的站点上搜一个用户名
maigret johndoe

# 生成 HTML 报告到当前目录
maigret johndoe --html --folderoutput ./reports
```

终端会实时打印进度：哪些站「确认存在账号」、HTTP 状态、从页面解析出的字段摘要。

## 为什么重要

Maigret 解决的是 OSINT 工作流里**最枯燥、最易漏**的一环：手工在几十个站点拼 URL、看 404 还是个人页。

不理解它，下面场景很难高效落地：

- **开源情报（OSINT）与背景调查**：记者、威胁情报分析师、招聘背调（须合法授权）常需把**同一化名**在不同平台的公开足迹拼起来；手工复制粘贴 URL 极易漏站、漏字段。
- **红队 / 渗透测试的信息收集阶段**：在拿到目标常用昵称后，快速枚举**公开攻击面**（哪些站暴露了真实姓名、邮箱片段、其他 ID），为后续社工或密码喷洒提供上下文——注意必须在**授权范围**内使用。
- **与 API 型 OSINT 工具的互补**：很多商业数据聚合依赖付费 API；Maigret 走的是**直接请求公开网页 + 站点规则库**，不强制 API Key，适合离线脚本、气隙环境或预算有限的个人研究。
- **可嵌入自动化流水线**：CLI 只是薄封装，底层是 `async` Python API，可塞进 FastAPI 服务、Jupyter、定时任务，与 [[gitleaks]]、[[ansible]] 等工具链并列而非替代。

> **法律与伦理边界（必读）**  
> 官方文档明确：工具仅供**教育及合法用途**。GDPR、CCPA 及各地个人信息保护法规对「收集、存储、处理个人数据」有严格要求。  
> 你只能在你有权调查的目标上使用；禁止用于骚扰、跟踪、未经授权的监控或任何违法活动。作者不对滥用负责。

## 核心概念

Maigret 的架构可以拆成 **六层**，理解后就能选对参数、控制扫描范围。

### 1. 站点数据库（Site Database）

每个站点在 JSON 数据库里是一条 **MaigretSite** 规则，通常包含：

| 字段含义 | 作用 |
|----------|------|
| URL 模板 | 如 `https://github.com/{username}`，把用户名代入即得待检测 URL |
| 存在性检测 | 通过 HTTP 状态码、页面关键词、正则等判断「该用户名是否已被占用」 |
| `usernameClaimed` / `usernameUnclaimed` | 维护者自测用的「已知存在 / 已知不存在」样本账号 |
| **tags** | 分类标签：`photo`、`dating`、`us`、`ru` 等，供 `--tags` 过滤 |

默认扫描 **Top 500**（按流量排序）；`-a` / `--all-sites` 启用全部 3000+ 站点，耗时会显著上升。

### 2. 异步并发检查（Async Checking）

核心函数 `maigret_search`（或底层 `maigret.checking.maigret`）用 **asyncio** 同时向大量站点发 HTTP 请求，受 `max_connections`（默认约 100）、`timeout`、`retries` 约束。  
这就像快递站同时派出 100 个骑手，而不是一个一个敲门。

### 3. 资料解析（Profile Parsing）

开启 `is_parsing_enabled=True`（CLI 默认对许多场景开启解析）时，会调用 **socid_extractor** 一类逻辑，从命中页面抽取：

- 简介、位置、注册时间等文本字段  
- 指向其他平台的链接 → 可能触发**递归搜索**  
- 平台特有 ID（如 `gaia_id`、`vk_id`，见 `--id-type`）

### 4. 递归搜索（Recursive Search）

在 A 站个人页发现「我的 Twitter：@othername」，Maigret 可把 `othername` **自动加入待搜队列**（默认开启，可用 `--no-recursion` 关闭）。  
类比：读完一张名片后，按名片上的第二个电话号码继续查。

### 5. 标签与范围控制（Tags & Scope）

缩小面、换场景时常用：

```bash
# 只查带 photo、dating 标签的站
maigret alice --tags photo,dating

# 只查标记为美国的站
maigret alice --tags us

# 只查单个站点条目
maigret alice --site GitHub

# 限制为最快的 100 个站
maigret alice --top-sites 100
```

### 6. 报告与导出（Reports）

支持 **HTML、PDF、CSV、JSON、NDJSON、TXT、XMind 8、交互式 Graph（D3）** 等。  
`--parse URL` 模式则反向：给一个已知主页 URL，先解析出用户名/ID，再展开搜索。

可选 **`--ai`**：把内部 Markdown 报告发给 OpenAI 兼容的 Chat Completions API，在终端流式输出一段调查摘要（需自行配置 API 端点与密钥）。

### 7. 代理、Tor 与 I2P

与 CLI 对应的库参数：`proxy`、`tor_proxy`、`i2p_proxy`，用于访问 `.onion` / `.i2p` 条目或绕过区域性封锁。  
部署时需本地已运行 Tor SOCKS（常见 `socks5://127.0.0.1:9050`）。

### 8. Web 界面

```bash
maigret --web 5000
# 浏览器打开 http://127.0.0.1:5000
```

提供搜索表单、结果关系图、账号表格、一键下载各格式报告——适合不想记 CLI 旗标的交互式探索。

### 9. 维护者工具：`--self-check` 与 `--submit`

- `--self-check`：用数据库里的 claimed/unclaimed 样本批量验证规则是否仍准确，适合 fork 后维护私有站点库。  
- `--submit URL`：对未知站点做半自动分析，询问是否写入本地数据库。

---

## 实践案例

### 案例 1：CLI 批量搜号 + 多格式报告

适合第一次摸底某个化名：

```bash
mkdir -p ~/osint-reports && cd ~/osint-reports

# 同时搜三个相关用户名，输出 HTML + JSON，结果分文件夹存放
maigret alice bob charlie \
  --html \
  --json simple \
  --folderoutput ./out \
  --top-sites 200

# 从已有主页反查：解析 Twitter/X 公开页，并递归搜发现的 ID
maigret --parse https://twitter.com/example --html
```

**参数说明**：

- 多个用户名用空格分隔，一次跑完比开三个终端省事。  
- `--folderoutput` 为每个用户名建子目录，避免报告互相覆盖。  
- `--parse` 适合「你已经有一条线索 URL，想自动扩线」。

### 案例 2：Python 库嵌入 — 最小异步搜索

官方推荐在自有工具里直接 `import`，不必 `subprocess` 调 CLI：

```python
import asyncio
import logging

from maigret import search as maigret_search
from maigret.sites import MaigretDatabase

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("maigret")

async def main():
  db = MaigretDatabase()
  await db.load_from_file()  # 加载内置站点库
  sites = db.ranked_sites_dict(top=100)  # 等价于 CLI 的 top 100

  results = await maigret_search(
      username="soxoj",
      site_dict=sites,
      logger=logger,
      timeout=30,
      is_parsing_enabled=True,  # 填充 result["ids_data"]
  )

  for site_name, result in results.items():
      if result["status"].is_found():
          print(site_name, result["url_user"])
          # 解析出的额外字段
          if result.get("ids_data"):
              print("  ids:", result["ids_data"])

asyncio.run(main())
```

要点：

- `maigret_search` 是 **async** 函数；在 FastAPI、aiohttp 等已有事件循环的环境里应 `await`，不要嵌套 `asyncio.run`。  
- 返回字典的每个条目含 `status`、`url_user`、`http_status`、`rank`、`ids_data` 等，用 `status.is_found()` 过滤命中。

### 案例 3：在已有服务里封装 + 代理

```python
from maigret import search as maigret_search
from maigret.sites import MaigretDatabase

db = MaigretDatabase()
# 仅 photo 类站点，等价 CLI --tags photo
sites = db.ranked_sites_dict(top=500, tags=["photo"])

async def check_username(username: str) -> dict[str, str]:
    results = await maigret_search(
        username=username,
        site_dict=sites,
        logger=logger,
        proxy="socks5://127.0.0.1:1080",
        tor_proxy="socks5://127.0.0.1:9050",
        timeout=45,
        max_connections=50,
    )
    return {
        name: r["url_user"]
        for name, r in results.items()
        if r["status"].is_found()
    }
```

适合：内网 OSINT 面板、工单系统「一键查昵称」按钮、与 SIEM 联动的 enrichment 插件。

### 案例 4：用户名变体（`--permute`）

当你只有真名或邮箱前缀，猜测可能在用的昵称时：

```bash
# 从 "john" 和 "doe" 生成 johndoe、john.doe、j_doe 等变体并全部搜索
maigret john doe --permute --html
```

这对「目标习惯用多种格式注册」的场景比单字符串搜索覆盖面更大。

---

## 与相近工具对比

| 工具 | 定位 | 与 Maigret 的关系 |
|------|------|-------------------|
| **Sherlock** | 经典用户名枚举 | Maigret 的前身；站点数、解析、报告较弱 |
| **Holehe** | 主要查**邮箱**是否在各站注册 | 输入维度不同，可互补 |
| **Social Analyzer** | 多引擎用户名/邮箱分析 | 更重 UI 与规则组合 |
| **Maltego** | 商业链路图 OSINT | 图形化强、商业授权；Maigret 适合脚本化批量 |

实践上常见组合：**Maigret 广撒网枚举** → 人工或 AI 读 HTML 报告 → 高价值账号再用浏览器深挖。

---

## 性能与误报控制

- **默认 Top 500 是平衡点**：全量 `-a` 可能跑数十分钟并触发大量 CAPTCHA / 限速；先用 `--top-sites` 或 `--tags` 缩小范围。  
- **`--self-check --auto-disable`**：自动禁用当前产生假阳性的站点条目，适合长期跑批前自维护。  
- **超时 `--timeout`**：网络差时适当加大；过大则拖慢整体 wall time。  
- **`--no-recursion`**：递归会指数扩线，调查面不明朗时先关掉，确认主干化名后再开。  
- **关键词高亮 `--keywords python rust`**：页面正文也含这些词时额外标记，帮助从海量命中里筛「技术向账号」。

---

## 安装方式补充

除 `pip install maigret` 外，官方还支持：

```bash
# 从源码
git clone https://github.com/soxoj/maigret
cd maigret
pip install .

# Docker（见仓库 wiki / CI 配置，镜像名以 upstream 为准）
docker run -it --rm soxoj/maigret maigret --help
```

无本地 Python 时，[maigret.dev](https://maigret.dev/) 提供**浏览器内受限试用**（约 Top 100 站、固定安全参数），适合体验流程再决定是否自建环境。

---

## 常见问题

**Q：为什么有些站显示找到，点进去却是空页？**  
A：站点改版、区域 CDN 差异或反爬策略会导致规则过期。向维护者提 issue，或用 `--self-check` / `--submit` 更新本地库。

**Q：需要登录才能看的资料能抓到吗？**  
A：不能。Maigret 只处理**公开 URL** 可访问时的页面；私密账号不会被判定为有效命中（除非站点错误地把私密页返回成 200）。

**Q：和 [[playwright]] 等浏览器自动化有何区别？**  
A：Playwright 驱动真实浏览器做功能测试；Maigret 是**大规模、轻量 HTTP + 规则库**的 OSINT 扫描器，不做通用 UI 自动化，但在「按用户名拼 URL 批量探测」这一垂直场景更高效。

**Q：`--ai` 会把数据发到哪？**  
A：发到你配置的 OpenAI 兼容 API 端点。敏感调查应在**自建模型 / 内网推理**或离线总结，勿把未脱敏报告发给第三方公有云。

---

## 学习路径建议

1. **第 1 天**：`pip install maigret`，对自己控制的**测试小号**跑 `maigret <name> --html`，打开报告熟悉字段。  
2. **第 2 天**：试 `--tags`、`--top-sites`、`--parse URL`，理解范围与递归。  
3. **第 3 天**：用案例 2 的 Python 片段把结果写进 JSON 文件或 SQLite。  
4. **第 4 天**：读 upstream `data/sites.json` 结构，尝试 `--submit` 加一条内部论坛规则。  
5. **持续**：关注 [Maigret 文档](https://maigret.readthedocs.io/) 与 [用法页](https://maigret.dev/docs/usage/) 的版本更新；维护者社区在 GitHub Discussions。

---

## 小结

Maigret 把「凭用户名查公开账号」这件事**工业化**了：站点规则库 + 异步并发 + 可选解析与递归 + 多格式报告 + Python API。它不会替代法律合规判断，也不会魔法般突破登录墙，但在**合法 OSINT 枚举**场景里，能省下大量手工拼 URL 的时间。

记住三个旋钮即可上手：**扫哪些站**（默认 500 / `-a` / `--tags`）、**挖多深**（递归与 `--parse`）、**怎么交付**（`--html` / 库函数返回的 `ids_data`）。

---

## 参考资料

- 项目仓库：[github.com/soxoj/maigret](https://github.com/soxoj/maigret)
- 官方文档：[maigret.readthedocs.io](https://maigret.readthedocs.io/)
- 用法与 Web 试用：[maigret.dev](https://maigret.dev/)
- PyPI：[pypi.org/project/maigret](https://pypi.org/project/maigret/)
- 库集成指南：[Library usage](https://maigret.readthedocs.io/en/stable/library-usage.html)
- 前身项目：[Sherlock](https://github.com/sherlock-project/sherlock)
