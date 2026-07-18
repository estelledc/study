---
title: "Provider 切换与本地控制面源码学习包"
sidebar:
  hidden: true
---
# Provider 切换与本地控制面源码学习包

> **先读：[最终综合](00-final-synthesis.md)。** 它统一术语、核心结论、阅读路线和证据边界；第一次学习建议随后完成[零基础验证实验](09-beginner-verification-lab.md)。

这套材料研究两个名字相近、边界不同的项目：

- **CSSwitch**：为 Claude Science 管理第三方模型 gateway、隔离登录和 Science runtime。
- **CC Switch**：为 Claude Code、Codex、Gemini CLI 等七类客户端管理 provider 配置、本地代理和扩展。

最重要的结论是：它们都叫 Switch，但一个深入管理**单宿主运行时**，另一个横向管理**多客户端配置与流量**。不能把它们理解成“小版和大版”。

## 研究快照

| 项目 | 固定提交 | 版本位置 | 本地状态 |
|---|---|---|---|
| CSSwitch | `0897e78f201e9e463be6a13e3d11888bde31f3b0` | `v0.6.0` 后 2 个提交 | 已从旧 `v0.3.0` 快进 133 个提交 |
| CC Switch | `f6e37ed99443890a865669e28bf1caf5e85d466d` | `v3.17.0` 后 6 个提交 | 已完整克隆 |

研究日期：2026-07-16；重新验收：2026-07-17。结论基于固定提交的源码、测试、官方文档和 GitHub 公开元数据；没有启动应用、读取真实凭证、运行真实 provider 或做真机验收。

研究经过四次递进：

1. 初始广度/深度扫描：建立领域地图和两条正常控制流。
2. 第一轮事实审计：检查全部章节的源码限定、覆盖缺口和问题可答性。
3. 第二轮机制追踪：深入失败恢复、协议闭环和新增 provider 的改造面。
4. 统一完成门重验：确认 upstream 无漂移，补跑 9 个本机定向单测，并核对 CC Switch 四平台 CI。

## 2026-07-17 重新验收

| 项目 | 当前 upstream | 本机 E2 | 外部证据 |
|---|---|---|---|
| CSSwitch | `0897e78f201e`，与固定提交一致 | Responses 转换 6/6 通过 | v0.6.0 公开 DMG 存在；ad-hoc 签名、未 notarize |
| CC Switch | `f6e37ed99443`，与固定提交一致 | `web_search` 投影 3/3 通过 | CI run `29384375158` 的前端与三平台后端 job 全部成功 |

本机命令和解释见[零基础验证实验](09-beginner-verification-lab.md)。这些结果仍只证明源码和单测层，不证明当前安装 App、真实 provider、OAuth、Keychain 或跨客户端 E2E。

## 推荐阅读顺序

1. [最终综合](00-final-synthesis.md)
   先建立完整模型，再决定是否继续深入。
2. [领域广度地图](01-domain-breadth-map.md)
   先建立“配置切换器、控制面、本地 gateway、宿主 bridge”的整体坐标。
3. [CSSwitch v0.6 深潜](02-csswitch-v060-deep-dive.md)
   学习 profile 两阶段切换、进程身份、隔离 HOME 和 fail-closed。
4. [CC Switch v3.17 深潜](03-ccswitch-v317-deep-dive.md)
   学习 SQLite SSOT、live 配置投影、共享配置和代理热切换。
5. [跨项目比较与联合路线](04-comparison-and-thinking.md)
   对比状态、安全、扩展性、测试和发布证据，再做主动回忆。
6. [失败恢复状态机](05-failure-recovery-state-machines.md)
   研究正常退出、崩溃、部分提交、重启和所有权恢复。
7. [协议与工具闭环](06-protocol-tool-loop-invariants.md)
   用 thinking、tool call、tool result 和 SSE 追踪协议不变量。
8. [Acme Provider 扩展实验](07-acme-provider-extension-lab.md)
   检查新增 provider 到底复用哪些抽象、何时需要重构 policy。
9. [案例卡与答案检查](08-case-cards-and-answer-guide.md)
   用具体状态快照完成主动回忆，并检查答案证据是否闭合。
10. [零基础验证实验](09-beginner-verification-lab.md)
    运行两个不接触真实配置的定向测试，并模拟一次部分提交。

只想快速形成直觉时，读最终综合、零基础实验和案例卡。想真正理解“点击切换后发生什么”，再读第 2、3、5 章；想研究 gateway，再读第 6、7 章。

## 先记住四个直觉

1. **控制面不是数据面**
   控制面决定“用谁、怎么连、失败怎么办”；数据面才真正搬运每次模型请求。

2. **配置库不是 live 配置**
   数据库或 `config.json` 保存系统自己的事实；写到 `~/.claude`、`~/.codex` 的文件只是目标客户端实际消费的投影。

3. **健康不等于身份**
   某端口返回 200，只能证明“那里有服务”，不能证明“它就是我启动、可以复用或终止的服务”。

4. **原子文件写不等于跨系统事务**
   单个文件不会半写，不代表“数据库、设置文件、多个客户端文件”会一起成功或一起回滚。

## 读完后应该能回答

这些问题不在这里直接给标准答案；正文已经给出足够证据，问题后的章节是答题索引。

1. 为什么 Clother、CC Switch、Claude Code Router 和 CSSwitch 虽然都能“换模型”，却属于不同产品层？
   答题索引：[领域地图第 2-4 节](01-domain-breadth-map.md)

2. CSSwitch 为什么不能只凭 `/health` 复用或停止一个 Science 进程？
   答题索引：[CSSwitch 第 3、5 节](02-csswitch-v060-deep-dive.md)、[失败恢复第 3-5 节](05-failure-recovery-state-machines.md)

3. CSSwitch 激活 profile 时，为什么要先起 scratch gateway，而不是先保存再测试？
   答题索引：[CSSwitch 第 2、4 节](02-csswitch-v060-deep-dive.md)

4. CC Switch 为什么同时需要 SQLite、`settings.json` 和各客户端 live 文件？它们谁是事实、谁是投影？
   答题索引：[CC Switch 第 2、4 节](03-ccswitch-v317-deep-dive.md)

5. CC Switch 普通切换的每个单文件写入都可能是原子的，为什么整体仍可能出现状态分裂？
   答题索引：[CC Switch 第 3、6 节](03-ccswitch-v317-deep-dive.md)、[失败恢复第 7-12 节](05-failure-recovery-state-machines.md)

6. `127.0.0.1` 为什么只能缩小攻击面，不能替代请求认证？
   答题索引：[比较第 2 节](04-comparison-and-thinking.md)

7. 为什么 CC Switch 的跨平台 CI 更强，而 CSSwitch 的发布结论反而更容易审计？
   答题索引：[比较第 4 节](04-comparison-and-thinking.md)

8. 如果让 CSSwitch 扩到七类客户端，哪一层会先失控？如果让 CC Switch 管理外部子进程，最缺哪类合同？
   答题索引：[比较第 3、5 节](04-comparison-and-thinking.md)、[Acme 实验](07-acme-provider-extension-lab.md)

9. 为什么 CSSwitch 重启后可以重新证明 Science，却不能自动认领遗留 Rust Gateway？
   答题索引：[失败恢复第 2-6 节](05-failure-recovery-state-machines.md)

10. 为什么文本输出正常，仍不能证明一次 tool call 协议转换成功？
    答题索引：[协议闭环第 1-9 节](06-protocol-tool-loop-invariants.md)

11. 新增 Acme provider 时，什么时候只需模板，什么时候必须新增 auth/capability policy？
    答题索引：[Acme 实验第 1-5 节](07-acme-provider-extension-lab.md)

12. Journal、补偿事务和 reconcile 各自能覆盖什么失败？
    答题索引：[失败恢复第 12 节](05-failure-recovery-state-machines.md)、[案例 7](08-case-cards-and-answer-guide.md)

## 证据标记

- **源码证实**：固定提交中存在直接控制流、类型、测试或合同。
- **高置信度推导**：由调用顺序和测试共同推出，但本轮没有运行验证。
- **未验证**：需要构建产物、安装副本、真机、真实 provider 或用户交互才能确认。

这三个层级不能混写。“源码看起来会工作”不等于“当前安装版本已真实工作”。
