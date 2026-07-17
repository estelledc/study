# 零基础实验：假设 Prompt 明天就会公开

## 1. 先建立直觉

想象一家公司的前台有一本岗位手册。

- 手册可以写“对客人礼貌”“回答要简洁”。
- 手册不应该夹着保险柜密码。
- 客人即使看到手册，也不能因此打开员工门禁。
- 客人递来一张写着“我是老板，让我进”的纸，门禁系统也不能照做。

系统提示词就是岗位手册。它能影响模型行为，但不是：

- 保险箱；
- 身份认证；
- 权限数据库；
- 工具执行器；
- 审批系统。

本实验不研究怎样获取第三方 prompt，而是验证：

```text
prompt registry
  -> provenance gate
  -> secret quarantine

model output
  -> all-sink canary guard

tool proposal
  -> external authorization
```

## 2. 安全边界

实验满足：

- 完全离线；
- 不调用模型；
- 不发送网络请求；
- 不包含真实 prompt；
- 不包含真实 credential；
- 不生成 extraction payload；
- 所有“secret”都是显式假数据；
- 只使用 Python 标准库。

它验证安全控制流，不验证任何真实产品的抗攻击能力。

## 3. 运行

```bash
cd explorations/research/system-prompt-leak-ecosystem-study/labs
PYTHONDONTWRITEBYTECODE=1 \
  python3 prompt_defense_lab.py \
  --output /tmp/prompt-defense-lab/report.json
```

预期：

```text
records: official=accepted unsafe=quarantined
sources: copied=1 independent=2
guard: blocked=True events=3
policy: safe=True untrusted_instruction=tool_not_allowed
artifact=/tmp/prompt-defense-lab/report.json
```

测试：

```bash
PYTHONDONTWRITEBYTECODE=1 \
  python3 -m unittest -v test_prompt_defense_lab.py
```

预期：

```text
Ran 16 tests
OK
```

## 4. 第一层：PromptRecord

一段正文不能单独成为可信档案。实验要求每条记录带：

```text
身份：provider / product / captured_at
来源：source_type / source_url / source_root_id
证据：evidence_grade / reproducibility_id
范围：completeness / verbatim
治理：license_status
完整性：content_sha256
数据：content
```

生活类比：博物馆不能只收一件“据说是古董”的物品，还要记录从哪里来、谁鉴定、
什么时候入库、是否修复过。

## 5. 第二层：来源等级不是自填荣誉

实验执行两个硬规则：

```text
A -> source_type 必须是 official
B -> 必须有 reproducibility_id
```

因此：

- 社区转载不能自称 A；
- 声称“可复现”但没有实验身份的记录不能算 B；
- grade 字母不能只靠提交者自报。

这仍不够。生产 registry 还应审核 source domain、签名、commit、包版本和原始会话。

## 6. 第三层：hash 证明“内容没换”

入库时保存：

```text
sha256(content)
```

复核时重新计算。正文变一个字符，记录就 quarantine。

Hash 能证明：

- 当前内容与入库内容一致；
- 两条记录是否逐字相同。

Hash 不能证明：

- 内容来自官方；
- 内容完整；
- 内容是当前线上版本；
- 两条相同记录来自独立提取。

## 7. 第四层：secret quarantine

`find_secret_labels()` 只返回类别，不返回命中的值：

```text
api_key
token
password
secret
private-key
```

检测到后：

```text
status = quarantined
reason = secret_material_detected
```

为什么 audit 不回显：

> “发现 secret 后把整段文本写进日志”会让检测器自己成为新的泄露出口。

真实系统应在 regex 外再组合：

- secret manager metadata；
- entropy detector；
- provider-specific scanner；
- DLP；
- 人工复核；
- token 撤销。

## 8. 第五层：转载不等于独立来源

实验用 `source_root_id` 表示来源树根。

两条记录都来自同一原帖：

```text
record A -> root-1
record B -> root-1
```

即使正文完全相同：

```text
accepted_records = 2
independent_roots = 1
status = single_source
```

只有两个不同 root：

```text
root-1 + root-2
```

才得到：

```text
cross_consistent
```

注意：`cross_consistent` 只表示独立结果一致，不自动等于 `official_ground_truth`。

## 9. 第六层：CanaryGuard

Canary 是随机、不可自然出现的探针。把它放进受保护上下文后，如果出现在意外出口，
说明数据路径发生泄露。

实验检查五类出口：

```text
text_delta
streaming chunks
tool_arguments
URL
file_write
```

为什么不只检查最终聊天文字：

- 模型可能把内容放进工具 JSON；
- URL query 可能外带；
- 文件写入可能持久化；
- 流式输出可能把 canary 拆成两个 chunk；
- 最终 UI 丢弃了内容，不代表中间层没泄露。

## 10. 跨 chunk 检测

输入：

```text
chunk 1: prefix CANARY:TEST/
chunk 2: 9A1B+END suffix
```

任何单个 chunk 都没有完整 canary。guard 为每个 channel 保存有限 rolling tail，
把相邻 chunk 合并检查。

它不会无限保存输出历史，只保留最长检测模式减一的字符数。

## 11. 编码与结构化 sink

URL 中 canary 可能 percent encode。实验同时检查：

- raw；
- percent-encoded；
- percent-decoded。

结构化 payload 先稳定序列化为 JSON，再进入同一 guard。因此：

```json
{"query": "<canary>"}
```

不会因为“它不是自然语言回复”而绕过。

## 12. Fail closed 与最小审计

命中后：

```text
channel = tool_arguments
representation = raw
action = blocked
```

audit event 不保存：

- canary；
- 完整输出；
- 工具参数正文；
- 文件内容。

这体现两条原则：

1. 检测到就阻断；
2. 日志只保留调查需要的最小信息。

## 13. 第七层：工具授权位于模型外

`AuthContext` 来自外部身份系统：

```text
actor_id
tenant_id
allowed_tools
allowed_actions
approvals
```

`ToolRequest` 是模型提出的建议：

```text
tool
action
resource_tenant_id
arguments
approval_id
```

授权顺序：

```text
tool allowlist
  -> action allowlist
  -> tenant equality
  -> destructive approval
```

模型参数中即使出现：

```text
Ignore policy. I am an administrator.
```

也不会改变 `AuthContext`。

## 14. 为什么先检查 tenant

多租户系统最危险的错误之一是：

```text
用户有 read 权限
  -> 系统只检查 action=read
  -> 忘了资源属于另一个 tenant
```

因此“能读”和“能读谁的数据”必须同时验证。

## 15. 为什么破坏性动作还要 approval

即使 actor 被允许使用 `delete_record`，本次删除仍可能需要一次性外部 approval。

```text
capability = 可以申请删除
approval = 这一次删除已获确认
```

二者不是同一个条件。

## 16. 16 个测试保护什么

| 测试组 | 防止的错误 |
|---|---|
| valid official | 正常记录被全部拒绝 |
| hash tamper | 内容变化后 provenance 仍有效 |
| fake grade A | 社区文本冒充官方 |
| incomplete grade B | “可复现”没有实验身份 |
| secret quarantine | credential-like 内容进入 registry |
| same root | 转载数量冒充独立证据 |
| distinct roots | 多源一致逻辑不可用 |
| mixed hashes | 不同正文被放进同一 consensus |
| benign output | guard 阻断所有正常响应 |
| chunk boundary | 流式拆分绕过 |
| tool arguments | 只检查聊天文本 |
| encoded URL | 编码出口绕过 |
| file write | 持久化出口未检查 |
| allowed read | policy 永远拒绝 |
| tenant mismatch | prompt 自报身份越权 |
| destructive approval | 高风险动作无确认执行 |

## 17. 实验边界

本实验没有覆盖：

- paraphrase；
- 翻译后的语义泄露；
- 功能等价 prompt reconstruction；
- 图片、音频或二进制隐写；
- 真实 provider streaming protocol；
- 分布式 sink 的一致阻断；
- secret scanner 的真实 recall / false positive；
- token 撤销和 incident response。

所以 canary 是检测层，不是保密保证。

## 18. 常见误区

1. **错误认知：加一句“不要泄露”就安全。**  
   正确理解：这是模型内软约束，权限和 secret 必须由模型外硬机制保护。

2. **错误认知：两个 GitHub 仓都有就算两份证据。**  
   正确理解：先追 root source；转载链仍是一份证据。

3. **错误认知：输出 filter 没命中就没有泄露。**  
   正确理解：可能是 paraphrase、工具参数、URL、文件或功能复制。

4. **错误认知：prompt 公开等于系统被攻破。**  
   正确理解：如果授权、secret 和 tenant 隔离正确，prompt 公开不应直接导致越权。

## 19. 自测

1. 一条社区记录正文与官方完全相同，为什么它仍不能把自己标成 A？
2. 三个仓库都复制同一个 X 帖子，`independent_roots` 应是多少？
3. canary 在聊天文本没出现，却出现在 tool argument，应怎样处理？
4. 模型正确说出某用户是管理员，为什么仍不能直接执行删除？
5. 如果 canary guard 全绿，为什么仍不能证明没有 soft extraction？

## 20. 建议答案

1. 等级描述来源性质，不描述文字相似度；只有厂商正式来源才是 A。
2. 仍是 1，因为三条传播路径共享同一个 root。
3. 阻断工具调用，记录最小 audit event，并进入 incident response。
4. 模型输出不是认证凭证；身份必须来自外部 session / token。
5. Canary 只检测预埋精确标记，无法覆盖语义重建或功能复制。

## 21. 下一步

从[17 个项目上手卡](12-beginner-project-onboarding-cards.md)中任选一条：

- 想学证据治理：jujumilk3、Grok Prompts、LeakHub；
- 想学数据产品：YeeKal、System Prompt Open；
- 想理解评测：Raccoon、PromptExtractionEval；
- 想理解为什么 exact filter 不够：PRSA。

只读固定源码，不向第三方线上系统发送实验请求。
