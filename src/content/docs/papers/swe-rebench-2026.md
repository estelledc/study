---
title: SWE-Rebench — 用 AI 自动从 GitHub "挖" 实时 Bug 修复任务
来源: 'https://arxiv.org/abs/2605.30896'
日期: 2026-06-13
分类_原始: 软件工程
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

## 是什么

SWE-Rebench 是一套**自动化流水线**，它的核心想法很简单：从 GitHub 上不断抓取真实的软件仓库，自动把它们变成"修复 Bug"的训练任务，然后源源不断地供给给 AI 编程代理（SWE Agent）去学习和评测。

日常类比：以前的编程能力考试像"期末考试"——题目固定、几年不换，学生（AI 模型）背答案就能高分。SWE-Rebench 的做法是**雇一个 AI 秘书天天逛 GitHub，看到有人提 Issue、有人发 Pull Request，就把它们摘下来做成"练习题"**。因为新题源源不断，所以不存在"背答案"的问题——这就是标题里"Continuously Refreshed"的意思。

## 为什么重要

在 SWE-Rebench 出现之前，AI 编程评测面临两个死结：

1. **数据太少**——真实世界的 Bug 修复任务需要人手工标注、配环境，一个月能攒几十个就不错了
2. **题目会泄露**——热门 benchmark（如 SWE-bench）被太多模型"见过"，测试成绩水分大

SWE-Rebench 用自动化流水线同时解决了这两个问题：21,000+ 任务、持续产出、零人工标注。

## 核心概念

### 1. 交互式 SWE 任务

一个 SWE 任务不只是"写一段代码"，而是包含：

- **Issue**：用户报告的 Bug 或需求（相当于"题目描述"）
- **代码仓库**：包含完整开发环境的 Git 仓库
- **测试套件**：用来验证修复是否正确的自动化测试
- **执行环境**：Docker 容器，保证每个任务在相同环境下运行

AI 代理需要像真实开发者一样：阅读 Issue → 克隆仓库 → 安装依赖 → 理解代码 → 修改代码 → 通过测试。

### 2. 自动化流水线

SWE-Rebench 的流水线分三步，全部自动化：

```
GitHub 抓取 → 任务提取 → 环境构建
```

- **抓取**：监控大量开源仓库的 Issue 和 Pull Request
- **提取**：用 LLM 判断这个 PR 是否可以变成一个可执行的修复任务
- **构建**：自动生成 Docker 镜像，包含仓库代码、依赖和测试

整个过程不需要人参与，所以可以大规模扩展。

### 3. 持续刷新（Continuous Refresh）

这是 SWE-Rebench 最核心的创新。传统 benchmark 是一次性的：

```
制作 benchmark → 发布 → 模型训练 → 评测 → benchmark 过时
```

SWE-Rebench 是持续的：

```
持续抓取 → 持续构建 → 持续评测 → benchmark 永远是新的
```

这意味着你可以随时拿最新模型来测，不用担心题目泄露。

## 代码示例

### 示例 1：一个 SWE-Rebench 任务的 JSON 结构

每个任务本质上是一个 JSON 文件，描述了一个完整的修复场景：

```json
{
  "instance_id": "django__django-12345",
  "repo": "https://github.com/django/django.git",
  "base_commit": "abc123def456...",
  "issue_text": "When using DecimalField with max_digits=10, values greater than 999999 throw an unexpected error...",
  "patch": "@@ -42,6 +42,8 @@\n+ if value > max_allowed:\n+     raise ValidationError('Too large')",
  "test_patch": "@@ -10,4 +10,8 @@\n+def test_large_decimal():\n+    assert DecimalField(10).clean(999999.99) == 999999.99",
  "environment_setup": "pip install -e '.[doc,test]' && python -m pytest --co"
}
```

拆解一下每个字段：

| 字段 | 作用 | 类比 |
|------|------|------|
| `instance_id` | 唯一标识，格式是 `仓库__编号` | 学号 |
| `repo` | 目标 Git 仓库地址 | 课本 |
| `base_commit` | 修复前的代码版本（Git commit hash） | 题目给出的初始状态 |
| `issue_text` | 用户描述的 Bug | 题目描述 |
| `patch` | 原始 PR 的修复内容（用于评分） | 标准答案 |
| `test_patch` | 额外添加的测试用例 | 附加考题 |
| `environment_setup` | 安装依赖的命令 | 实验课前准备 |

### 示例 2：用 SWE-Rebench 评测一个模型

SWE-Rebench 提供了命令行工具来运行评测：

```bash
# 1. 安装 SWE-Rebench
pip install swe-rebench

# 2. 运行评测（以 GPT-4 为例）
swe-rebench configs/gpt4.config

# 3. 查看结果
swe-rebench report --output results.html
```

一个典型的配置文件 `gpt4.config` 长这样：

```yaml
SWE-Rebench:
  TaskCollection: swebench_verified
  Model: GPT-4
  InstanceFilter:
  Strategy: default

  GPT-4:
    model: gpt-4
    api_base: https://api.openai.com/v1
    api_key: ${OPENAI_API_KEY}
    prompt_template: default
    max_steps: 50
    temperature: 0.2
```

关键参数说明：

- `TaskCollection`：用哪组题目（可以是 swebench_verified、swe-rebench 自建数据集等）
- `Model`：要评测的模型名称
- `max_steps`：代理最多允许执行多少步操作（防止无限循环）
- `temperature`：生成随机性，0.2 表示比较保守 deterministic 的修复策略

### 示例 3：自动化流水线中的 LLM 筛选环节

SWE-Rebench 从 GitHub 抓到大量 PR 后，需要用 LLM 判断哪些适合变成训练任务。伪代码如下：

```python
# 伪代码：判断一个 PR 是否可以成为 SWE 训练任务
def is_suitable_task(repo, issue, pr):
    # 第一步：用 LLM 判断 issue 描述是否清晰
    clarity = llm_call(
        prompt=f"""
        以下是一个 GitHub Issue 的描述，请判断它是否足够清晰，
        让一个开发者知道要修什么。只回答 YES 或 NO。

        Issue: {issue.text}
        """,
        model="gpt-4"
    )
    if clarity.strip() != "YES":
        return False

    # 第二步：检查是否有对应的测试可以验证修复
    has_tests = check_test_suite(repo, pr.files_changed)
    if not has_tests:
        return False

    # 第三步：确认仓库可以构建（Docker 镜像能正常 build）
    can_build = try_build_docker(repo, pr.base_commit)
    if not can_build:
        return False

    return True
```

这三道筛子过滤掉：描述不清的 PR、没有测试的 PR、环境无法搭建的 PR，最终留下的才是高质量的训练任务。

## SWE-Rebench 与 SWE-bench 的关系

很多人容易混淆这两个名字很像的东西：

| | SWE-bench | SWE-Rebench |
|---|---|---|
| **特点** | 手动挑选、固定数据集 | 自动抓取、持续刷新 |
| **规模** | 约 300 个 verified 任务 | 21,000+ 任务 |
| **语言** | 主要是 Python | Python 为主，可扩展 |
| **用途** | 评测（Benchmark） | 训练 + 评测 |
| **更新频率** | 几乎不更新 | 持续产出新任务 |

简单说：SWE-bench 像"高考真题集"，SWE-Rebench 像"每日练习题"。

## 关键贡献

1. **自动化流水线**——首次实现从 GitHub 到可执行训练任务的端到端自动化，无需人工标注
2. **大规模数据集**——21,000+ 任务，远超此前任何 SWE 数据集
3. **污染检测**——用持续产出的新任务证明：部分模型在 SWE-bench 上的成绩存在数据泄露
4. **开源可复现**——数据集、流水线代码、评测工具全部开源

## 局限与思考

- **Python 偏向**——当前数据集以 Python 为主，其他语言的覆盖有限（后续 V2 版本已扩展到 20 种语言）
- **LLM 筛选的误差**——用 LLM 判断任务质量，本身可能有误判
- **Docker 构建失败**——并非所有 GitHub 仓库都能顺利构建 Docker 镜像，这部分被过滤掉了

## 一句话总结

SWE-Rebench 用一个"AI 秘书天天逛 GitHub"的自动化流水线，解决了 AI 编程训练数据不够多、评测题目会被背熟这两个核心痛点。
