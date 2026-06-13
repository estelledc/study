---
title: Maigret 零基础入门 — 凭用户名跨 3000+ 站点做 OSINT
来源: https://github.com/soxoj/maigret
日期: 2026-06-13
子分类: 安全与隐私
分类: 安全与隐私
provenance: pipeline-v3
---

## 从日常类比说起

想象你在城市里找一位只用网名活动的朋友：他可能在 GitHub 写代码、在摄影站发图、在论坛灌水、在二手平台卖货。你**不知道真名和手机号**，只记得他几乎到处都叫 `johndoe`。

手工做法是什么？打开浏览器，把 `johndoe` 填进几十个网站的搜索框，或者凭经验拼 URL：`github.com/johndoe`、`reddit.com/user/johndoe`……一个一个试，看是 404 还是个人主页。一天下来，手指酸、眼睛花，还必然漏站。

**Maigret**（[soxoj/maigret](https://github.com/soxoj/maigret)）做的事，相当于雇了一支**并行跑腿队**：你只喊一次「帮我查 `johndoe`」，它同时去 3000+ 个已录入规则的网站敲门，谁回「这个用户名有人用了」，就把公开主页链接抄回来，还能从页面里抠出简介、头像、注册时间、以及页面上写明的其他账号 ID，最后整理成 HTML / JSON 报告。

名字来自法国侦探小说里的 **Jules Maigret**——不靠蛮力，靠理解人和人之间的关系网。工具本身也是著名 OSINT 项目 [Sherlock](https://github.com/sherlock-project/sherlock) 的加强 fork：站点更多、能解析资料、能递归扩线、能当 Python 库嵌入流水线。

> **法律与伦理（零基础也必须先读）**  
> Maigret 只访问**公开网页**，不需要目标密码，也不等于「可以随便查任何人」。GDPR、个人信息保护法及各地法规对收集、存储、处理个人数据有严格要求。  
> 仅在你**有权调查**的目标上使用（自己的账号、授权渗透测试、合规新闻调查等）。禁止用于骚扰、跟踪或未授权监控。滥用责任由使用者承担。

---

## 它到底是什么

一句话：**输入用户名 → 批量探测数千站点是否存在同名公开账号 → 可选解析页面元数据 → 输出报告。**

技术栈：Python 3.10+（推荐 3.11），异步 HTTP 并发，内置 JSON 站点规则库（每次运行可自动从 GitHub 拉取更新，离线则用内置库）。**不需要各站 API Key**——靠的是维护者写好的 URL 模板和「页面长什么样算命中」的检测规则。

默认行为（和全量扫描的区别很重要）：

| 模式 | 含义 | 适用场景 |
|------|------|----------|
| 默认 Top 500 | 按流量排名扫描前 500 个站 | 日常摸底，几分钟级 |
| `-a` / `--all-sites` | 扫描库内全部 3000+ 站 | 深度调查，耗时长、易触发限速 |
| `--tags photo,dating` | 只扫带指定标签的站 | 按场景缩小面 |
| `--top-sites 100` | 只扫前 100 个站 | 快速验证化名是否存在 |

---

## 核心概念（读懂就能少踩坑）

### 1. 站点规则库（Site Database）

每个网站在库里是一条规则，大致包含：

- **URL 模板**：`https://example.com/users/{username}`
- **存在性判定**：HTTP 状态码、页面是否含某关键词、正则等
- **tags**：如 `us`、`ru`、`photo`、`coding`，供 `--tags` 过滤
- **usernameClaimed / usernameUnclaimed**：维护者用来 `--self-check` 的自测样本

类比：不是让 AI「猜」有没有账号，而是**按菜谱**——每家店规定「菜单上写这个名字就代表有人占了」。

### 2. 异步并发（Async Checking）

核心 API `maigret_search` 用 `asyncio` 同时发大量请求，受 `timeout`、`retries`、`max_connections`（默认约 100）约束。  
像快递站同时派出 100 个骑手，而不是挨个小区步行。

### 3. 资料解析（Profile Parsing）

命中后可选开启解析（`is_parsing_enabled=True`），从 HTML / 开放接口抽字段：bio、location、头像 URL、关注数，以及页面上出现的**其他平台用户名**。  
例如 GitHub 简介里写了 Twitter `@sox0j`，这就是扩线线索。

### 4. 递归搜索（Recursive Search）

发现新用户名或 ID 后，可自动加入待搜队列（默认开启，可用 `--no-recursion` 关闭）。  
读完一张名片，按名片上的第二个号码继续查——扩线快，但也容易爆炸，不明朗时先关递归。

### 5. 反向入口：`--parse URL`

已有主页链接、不知道用户名怎么写时：

```bash
maigret --parse https://github.com/soxoj --html
```

工具先解析页面提取用户名和 ID，再展开常规搜索。

### 6. 报告与交付

CLI 支持 `--html`、`--pdf`（可选依赖 `pip install 'maigret[pdf]'`）、`--json`、`--csv`、`--xmind` 等；`--folderoutput` 为多用户名分目录存放。  
Web UI：`maigret --web 5000`，浏览器打开 `http://127.0.0.1:5000` 看图谱和表格。

### 7. 与 Sherlock / Holehe 的分工

- **Sherlock**：同源思路，站点和解析能力较弱，Maigret 可视为继任加强版。  
- **Holehe**：主要问「这个**邮箱**在哪些站注册过」，输入维度不同，常与 Maigret **互补**。

---

## 安装与第一次运行

```bash
# 需要 Python 3.10+
pip install maigret

# 对默认 Top 500 站点搜索
maigret YOUR_USERNAME

# 生成 HTML 报告到当前目录
maigret YOUR_USERNAME --html --folderoutput ./reports
```

无本地 Python 时，可体验 [maigret.dev](https://maigret.dev/) 的浏览器试用（约 Top 100、固定安全参数），或 Docker：

```bash
docker pull soxoj/maigret
docker run -v "$(pwd)/reports:/app/reports" soxoj/maigret:latest johndoe --html
```

终端输出里，`[+]` 表示确认找到账号，`[-]` 是进度信息，`[!]` 常是提示（例如「可用 `-a` 扫全库」）。

---

## 代码示例 1：CLI 常用组合

适合零基础「摸清一个化名」的脚本：

```bash
#!/usr/bin/env bash
# osint-quick.sh — 用测试小号或授权目标，勿对陌生人滥用
set -euo pipefail

USER="${1:?用法: ./osint-quick.sh <username>}"
OUT="./maigret-out/$(date +%Y%m%d)-${USER}"
mkdir -p "$OUT"

maigret "$USER" \
  --top-sites 200 \
  --tags coding \
  --html \
  --json simple \
  --folderoutput "$OUT" \
  --timeout 25

echo "报告目录: $OUT"
```

说明：

- `--top-sites 200` 比默认 500 更快，适合先跑一轮。  
- `--tags coding` 只查开发类站点，噪声少。  
- 多个用户名可空格分隔：`maigret alice bob --html`。  
- 真名拆成变体：`maigret john doe --permute` 会生成 `johndoe`、`john.doe` 等并全部搜索。

---

## 代码示例 2：Python 库最小嵌入

CLI 是薄封装；流水线里更推荐直接 `import`（摘自 [官方 Library usage](https://maigret.readthedocs.io/en/stable/library-usage.html)）：

```python
import asyncio
import logging

from maigret import search as maigret_search
from maigret.sites import MaigretDatabase

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("maigret")

async def hunt(username: str, top: int = 100) -> list[tuple[str, str]]:
    db = MaigretDatabase()
    await db.load_from_file()  # 内置站点库，可自动更新
    sites = db.ranked_sites_dict(top=top)

    results = await maigret_search(
        username=username,
        site_dict=sites,
        logger=logger,
        timeout=30,
        is_parsing_enabled=True,  # 填充 ids_data：bio、外链账号等
    )

    hits = []
    for site_name, result in results.items():
        if result["status"].is_found():
            hits.append((site_name, result["url_user"]))
            ids = result.get("ids_data") or {}
            if ids:
                print(f"  [{site_name}] extra:", ids)
    return hits

if __name__ == "__main__":
    found = asyncio.run(hunt("soxoj", top=50))
    print(f"共 {len(found)} 个命中")
```

要点：

- `maigret_search` 是 **async** 函数；在 FastAPI 等已有事件循环里用 `await`，不要套娃 `asyncio.run`。  
- `ranked_sites_dict(top=200, tags=["photo"])` 与 CLI 的 `--tags` 等价。  
- 需要 Tor / 代理时传 `tor_proxy="socks5://127.0.0.1:9050"` 等参数，与 CLI 旗标一一对应。

---

## 代码示例 3：Docker + 全站扫描（慎用）

深度调查时才建议 `-a`，耗时可到数十分钟，且部分站点会 CAPTCHA：

```bash
mkdir -p reports
docker run --rm \
  -v "$PWD/reports:/app/reports" \
  soxoj/maigret:latest \
  user1 user2 user3 -a --html --folderoutput /app/reports
```

维护者还可 `--self-check --auto-disable` 验证规则是否过期，或用 `--submit URL` 半自动把新站点写入本地库。

---

## 输出长什么样

成功命中时，终端可能类似（摘自官方文档）：

```text
[+] GitHub: https://github.com/soxoj
        ├─location: Amsterdam, Netherlands
        ├─fullname: Soxoj
        ├─twitter_username: sox0j
        └─bio: Head of OSINT Center of Excellence in @SocialLinks-IO
```

这里的 `twitter_username` 就是**递归扩线**的燃料。HTML 报告通常含链接列表、关系图（D3）、可下载的 JSON 副本，便于存档或接下游分析。

---

## 性能、误报与排错

1. **先小后大**：默认 Top 500 → 确认有价值再 `-a`。  
2. **假阳性**：站点改版会导致规则过期；对长期跑批先 `--self-check`。  
3. **超时**：`--timeout 45` 在网络差时减少漏检，但拉长总时间。  
4. **私密账号**：未登录看不见的页面，工具**不能**当成有效命中（除非站点错误返回 200）。  
5. **递归**：面不明朗时用 `--no-recursion`，确认主干化名后再开。  
6. **PDF**：`pip install 'maigret[pdf]'`，部分 Linux 环境还需 Cairo 相关系统库。

---

## 零基础学习路径（建议 4 天）

| 天 | 任务 |
|----|------|
| 第 1 天 | `pip install maigret`，对自己控制的**小号**跑 `maigret <name> --html`，打开报告熟悉字段 |
| 第 2 天 | 试 `--tags`、`--top-sites`、`--parse URL`，理解扫描范围与递归 |
| 第 3 天 | 跑通上文 Python 示例，把命中写入 JSON 或 SQLite |
| 第 4 天 | 读仓库 `data` 目录站点 JSON 结构，了解 `--submit` 如何加自定义内网站点 |

---

## 小结

Maigret 把 OSINT 里**最枯燥的用户名枚举**工业化：站点规则库 + 异步 HTTP + 可选解析与递归 + 多格式报告 + Python API。它不会替代法律合规判断，也无法突破登录墙，但在合法、授权的开源情报场景里，能省下大量手工拼 URL 的时间。

记住三个旋钮：**扫哪些站**（Top 500 / `-a` / `--tags`）、**挖多深**（解析与递归 / `--parse`）、**怎么交付**（`--html` 或库里的 `ids_data`）。

---

## 参考资料

- 仓库：[github.com/soxoj/maigret](https://github.com/soxoj/maigret)
- 文档：[maigret.readthedocs.io](https://maigret.readthedocs.io/)
- 试用与用法：[maigret.dev](https://maigret.dev/)
- PyPI：[pypi.org/project/maigret](https://pypi.org/project/maigret/)
- 前身：[Sherlock](https://github.com/sherlock-project/sherlock)
