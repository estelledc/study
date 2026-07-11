# 公开仓库数据边界

仓库中的跟踪文件、构建产物和 CI 日志都按公开数据处理。`robots.txt` 不是访问控制，删除当前文件也不能替代真实凭证的轮换。

## 可以提交

- 公开源码、公开来源 URL 和不可变公开修订
- 结构化审查摘要与 SHA-256
- 使用明显虚构值的安全测试；测试在临时目录生成值，不把敏感形态原文写进仓库
- `.env.example`，前提是只含占位配置

## 不可以提交

- 环境文件、私钥、签名证书、provisioning profile 或本地凭证库
- 平台 token、访问密钥、设备或签名身份值
- 用户特定的 macOS、Linux 或 Windows home 绝对路径
- ignored runtime、完整私有 prompt、内部上下文或原始命令输出
- 指向工作区外部的跟踪软链接

## 扫描边界

```bash
node scripts/audit-public-redlines.mjs --tracked --json
git ls-files -z | node scripts/audit-public-redlines.mjs --stdin0
```

两种入口都会先读取 Git 跟踪清单。`--stdin0` 的输入还会与该清单取交集，因此不能借它读取 ignored 或未跟踪 runtime。软链接只用 `lstat` 检查，不跟随目标。

所有文件都扫描原始/UTF-8/UTF-16LE/UTF-16BE 凭证形态，图片也不能夹带 token。二进制默认 fail closed；当前只允许扩展名与 RIFF/WEBP/chunk 边界同时匹配的 WebP。现有 431 个 WebP 走同一规则，不依赖“历史文件跳过”。

报告只包含类别、仓库相对路径、行号和不可逆 fingerprint，不回显命中原文。行号只是诊断信息，历史基线身份由“类别 + 相对路径 + fingerprint”组成，移动或改变原值都会成为新违规。

## 历史兼容

五处受保护的既有路径示例与 Chalk 笔记中既有的 ANSI ESC 教学字符不能在本轮重写。`data/public-redline-baseline.json` 只记录它们的不可逆 fingerprint；这些项显示为 `LEGACY_BASELINE`，任何新命中都 fail closed。占位用户名、容器 runner 路径和 URL 片段由通用规则抑制，避免把教程示例一概当作隐私泄漏。

若扫描命中可能仍然有效的真实凭证，应立即停止发布并走对应平台的轮换/吊销流程；不要把“从当前分支删除”写成已经完成处置。
