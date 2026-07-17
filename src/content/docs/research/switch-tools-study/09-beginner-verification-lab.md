# 09. 零基础验证实验：看见控制面、投影和协议边界

> 目标：不启动 App、不读取真实 HOME、不接触 API Key，用两个定向单测和一个纸面状态实验建立核心直觉。
>
> 基线：CSSwitch `0897e78f201e9e463be6a13e3d11888bde31f3b0`；CC Switch `f6e37ed99443890a865669e28bf1caf5e85d466d`。

## 0. 先建立生活类比

想象一家连锁店：

- 总部系统里选“供应商 B”，这是**控制面**。
- 每家门店收银机里真正保存的地址，这是 **live config**。
- 收银机把订单发给谁，这是**数据面**。

总部显示 B，不代表门店已经从 A 切到 B。如果总部数据库和门店文件不是一个事务更新，就可能出现：

```text
总部选择 = B
数据库记录 = B
门店真实地址 = A
```

CSSwitch 还多一个问题：门口有一辆货车在运行，不代表这辆车就是总部刚派出的，更不代表当前程序有权把它熄火。这对应 health、identity、ownership 三个不同概念。

## 1. 核对源码身份

从 `intern-journal` 根目录运行：

```bash
git -C explorations/research/repos/csswitch status --short --branch
git -C explorations/research/repos/csswitch rev-parse HEAD

git -C explorations/research/repos/ccswitch status --short --branch
git -C explorations/research/repos/ccswitch rev-parse HEAD
```

2026-07-17 的预期提交：

```text
CSSwitch  0897e78f201e9e463be6a13e3d11888bde31f3b0
CC Switch f6e37ed99443890a865669e28bf1caf5e85d466d
```

如果工作树不干净，停止。第三方源码中的未提交内容按用户数据保护。

## 2. CSSwitch：验证 Responses 转换不变量

命令把构建产物放到 `/tmp`，不在第三方仓创建 `target/`：

```bash
cd explorations/research/repos/csswitch
CARGO_TARGET_DIR=/tmp/csswitch-gateway-target-20260717 \
  cargo test \
  --manifest-path desktop/gateway/Cargo.toml \
  openai_responses::tests \
  --lib
```

2026-07-17 实测：

```text
6 passed; 0 failed; 96 filtered out
```

六个测试分别保护：

1. Anthropic 请求转 OpenAI Responses 的 golden fixture。
2. DashScope 对 `web_search` 和工具数量的特殊规则。
3. DashScope host 判定。
4. Responses 响应转 Anthropic 消息。
5. `incomplete` 映射为 `max_tokens`。
6. tool result object 的稳定 JSON 序列化。

### 这能证明什么

- 固定提交里的六个纯转换合同在当前 macOS/Rust 环境通过。
- Acme 若复用标准 Responses + Bearer 路线，已有转换基线可复用。

### 不能证明什么

- 真实 provider endpoint 可用。
- SSE 首 token 延迟或截断恢复正确。
- CSSwitch App、Science runtime、安装包或公开 DMG 可运行。
- 新 Acme policy 已实现；它仍是设计实验。

## 3. CC Switch：验证 `web_search` 投影

回到仓库根目录：

```bash
cd explorations/research/repos/ccswitch
CARGO_TARGET_DIR=/tmp/ccswitch-target-20260717 \
  cargo test \
  --manifest-path src-tauri/Cargo.toml \
  native_web_search_field_ \
  --lib
```

首次执行需要下载并编译 Tauri/Rust 依赖。2026-07-17 实测约 3 分 06 秒：

```text
3 passed; 0 failed; 1975 filtered out
```

三个测试保护：

1. 已知不支持 `web_search` 时，在顶层写入禁用哨兵。
2. 能力恢复时，只移除 CC Switch 自己写入的哨兵。
3. 用户已有显式值时，不擅自覆盖。

### 为什么第三条最重要

“切换工具”不是配置文件唯一所有者。用户和目标客户端也会写 live config。一个安全投影器只清理自己拥有的字段，不把“我能写”误解成“整个文件归我”。

### 这能证明什么

- 固定提交的三个配置变换在当前 macOS/Rust 环境通过。
- “写入自己的哨兵、恢复时只删除自己的哨兵”有单测保护。

### 不能证明什么

- 完整 provider 切换跨 device、SQLite 和 live 文件原子完成。
- Codex、Claude、Gemini 等真实客户端会立即重读配置。
- 本地 proxy、failover、OAuth 或 Keychain 可用。

## 4. 用临时文件模拟部分提交

下面不是 CC Switch 实现，只是最小心智模型：

```bash
python3 - <<'PY'
from pathlib import Path
from tempfile import TemporaryDirectory

with TemporaryDirectory() as temp:
    root = Path(temp)
    device = root / "device.txt"
    database = root / "database.txt"
    live = root / "live.txt"
    for path in (device, database, live):
        path.write_text("A", encoding="utf-8")

    device.write_text("B", encoding="utf-8")
    database.write_text("B", encoding="utf-8")
    # 模拟 live 写入前崩溃

    print("device", device.read_text())
    print("database", database.read_text())
    print("live", live.read_text())
PY
```

结果：

```text
device B
database B
live A
```

三个文件都没有半写，但业务状态仍然分裂。由此区分：

- 原子文件写：一个文件完整。
- 数据库事务：数据库内部一致。
- 业务事务：多个参与者共同一致。
- reconcile：崩溃后比较并恢复。

## 5. 读取上游 CI，不冒充本机测试

CC Switch 同一提交的公开 CI：

```bash
gh run view 29384375158 \
  -R farion1231/cc-switch \
  --json conclusion,jobs,url
```

2026-07-17 复核到四个成功 job：

- Frontend Checks。
- Backend Checks (Ubuntu)。
- Backend Checks (Windows)。
- Backend Checks (macOS)。

这是 E3 外部 CI 证据；本机只运行了三个定向测试。两者不能合并成“本机全套测试通过”。

CSSwitch v0.6.0 的公开 release 也只能分层阅读：

- 公开 DMG 的 size 和 SHA-256 可核对。
- DMG 结构曾验证为有效。
- App 是 ad-hoc 签名。
- 没有 Developer ID、notarization 或 Gatekeeper acceptance。

详细证据见 CSSwitch 仓库的 `docs/evidence/releases/v0.6.0.md`。

## 6. 主动回忆

1. 为什么 CSSwitch 的 `/health` 返回 200 仍不足以停止进程？
2. 为什么 CC Switch 只删除自己写入的 `web_search` 哨兵？
3. `device=B, database=B, live=A` 时，UI 和真实请求可能分别看到谁？
4. 6 个协议单测通过后，为什么仍不能写“真实 Acme provider 可用”？
5. 上游四平台 CI 全绿，为什么不等于当前安装的 App 已通过真机验收？

答案入口：

- [最终综合](00-final-synthesis.md)
- [失败恢复状态机](05-failure-recovery-state-machines.md)
- [案例卡](08-case-cards-and-answer-guide.md)

## 7. 完成标准

- [ ] 能用自己的话区分控制面、live config 和数据面。
- [ ] CSSwitch 6 个定向测试通过。
- [ ] CC Switch 3 个定向测试通过。
- [ ] 能解释“每个文件都完整，但整体仍分裂”。
- [ ] 能按 E1/E2/E3 分开写本地源码、定向单测和上游 CI。
- [ ] 没有启动 App、真实 provider 或读取用户凭证。
