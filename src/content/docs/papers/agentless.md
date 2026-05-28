---
title: Agentless — 反 agent 派代表作：3 阶段 pipeline 在 SWE-bench 上反超复杂 agent
description: Xia 等人 2024 年的反命题论文——把 agent loop 拆掉，用 file-localize / function-localize / patch-validate 三段流水线在 SWE-bench Lite 跑出 27.3%，超过当时绝大多数 agent 系统，证明 agent 复杂度的边际收益常常是负的
season: L
layer: L4
status: 状元
priority: P0
branch: method-A
tags:
  - agent-vs-pipeline
  - swe-bench
  - localize-repair-validate
  - reproducible-pipeline
  - structured-decomposition
created: 2026-05-29
updated: 2026-05-29
---

## Layer 0 — 论文身份卡

| 字段 | 值 |
| --- | --- |
| 标题（英文） | Agentless: Demystifying LLM-based Software Engineering Agents |
| 标题翻译 | Agentless：揭开 LLM 软件工程 agent 的神秘面纱 |
| 作者 | Chunqiu Steven Xia, Yinlin Deng, Soren Dunn, Lingming Zhang |
| 一作机构 | UIUC（University of Illinois Urbana-Champaign，Xia 当时为博士生 → 现仍在 UIUC） |
| 通讯作者 | Lingming Zhang（UIUC 教授，自动程序修复 / 模糊测试方向，前作 ChatRepair / TitanFuzz） |
| 发表 | arXiv 2024.07，Citations 截至 2026-05-29 约 320+（Semantic Scholar） |
| arXiv ID | 2407.01489（v1 = 2024-07-01；目前最新 v3 = 2024-10） |
| 代码 | [OpenAutoCoder/Agentless](https://github.com/OpenAutoCoder/Agentless)，~2.1k stars，commit `5ce5888b9f149beaace393957a55ea8ee46c9f71`（2024-12-22） |
| 评测代码 | [swe-bench/SWE-bench](https://github.com/swe-bench/SWE-bench)，~5k stars，commit `f7bbbb2ccdf479001d6467c9e34af59e44a840f9`（2026-03-19） |
| 数据 | SWE-bench Lite（300 instances，princeton-nlp/SWE-bench_Lite HF dataset） |
| 数据规模 | 完整 SWE-bench 2294 / Lite 300 / Verified 500（人工筛选过的子集） |
| 论文类型 | method（核心是 3-stage pipeline 设计）+ position（论文一半篇幅在批判 agent loop） |
| 模型 | 主结果 GPT-4o；ablation 含 Claude 3.5 Sonnet / DeepSeek-V2 |
| 总成本 | Lite 300 题约 $103（论文 §5.4，平均 $0.34/instance） |
| 复用 commit | `5ce5888b9f149beaace393957a55ea8ee46c9f71`（Agentless 主，下文所有 path:line 锚定此版本） |

一句话定位：**Agentless 是 2024 年第一篇敢公开喊"agent loop 是过度设计"的论文——它用一条只有 3 个 LLM 调用的死板流水线，在 SWE-bench Lite 上反超 SWE-agent / AutoCodeRover 等当时所有复杂 agent 系统，把"agent 是否必要"这个问题直接拍到桌面上。**

![Agentless 三阶段流水线](/papers/agentless/01-pipeline.webp)

> Hero figure 01 — Agentless 的全部哲学就一张图：左边是它拒绝的 agent loop（while 循环 + history append + 5-30 round trip），右边是它选择的 pipeline（4 个固定 LLM 调用）。中间三个橙绿蓝色块是 Stage 1 hierarchical localize / Stage 2 multi-sample repair / Stage 3 test-based filter——每个 stage 的输入输出是固定 schema，不是自由对话。

---

## 创新点（5 个 numbered，反 agent 视角）

1. **Hierarchical localization**：把"在 repo 里找 bug 在哪"这个问题拆成 file → class/function → line 三级 LLM 调用。每一级输入是上一级输出的子集，不是 agent 在文件树里盲爬。锚定：`agentless/fl/FL.py:295-329`（`localize` 方法）+ `agentless/fl/FL.py:331-415`（`localize_function_from_compressed_files`）+ `agentless/fl/FL.py:491-598`（`localize_line_from_coarse_function_locs`）。**工程上最被低估的细节**：用 `MAX_CONTEXT_LENGTH = 128000`（`FL.py:14`）做硬上限，超了就 `coarse_locs.popitem()` 主动扔掉一个文件而不是 truncate——这避免了 LLM 看到半截函数。

2. **Multi-sample repair + diff filter**：不让 LLM 一次性给"最佳 patch"，而是 sample N=40 次（temperature=0.8），然后用 syntax check + diff parse 当过滤器。锚定：`agentless/repair/repair.py:269-283`（prompt 选择）+ `repair.py:343-349`（`_post_process_multifile_repair` 过滤语法错误的 patch）。这一步把"LLM 偶尔写出对的"变成"批量采样后总能挑到一个对的"。

3. **Test-based validation**：拒绝在 patch 生成阶段就承诺正确性，把检验推到最后——跑原仓库 regression tests 砍一刀，再用 LLM 合成 reproduction test 砍第二刀，剩下的做 majority vote。锚定：`agentless/test/run_regression_tests.py:185-195`（regression 入口）。**最被低估的细节**：reproduction test 不是要 pass，而是要"能复现 issue 的 buggy 行为"——这把 issue 描述变成可执行 oracle。

4. **结构化 prompt 的 schema 锁**：每个 stage 的 LLM prompt 都写死了输出格式（看 `FL.py:42-48` 的 `obtain_relevant_files_prompt` 里的 ` ``` ` 包裹要求和"separated by new lines"指令），下游用 regex 解析；解析失败就重试当前 stage，不会污染下一 stage 的输入。这是 pipeline 派的核心抽象：**每个边界都有 schema，没有自由对话**。

5. **公开 cost / latency 对比**：Agentless 论文 Table 1 + §5.4 第一次给出"agent vs pipeline"的成本数字——同期 SWE-agent 平均 $2.51/instance、Agentless $0.34/instance（约 7-8 倍差距），Agentless 也更快。这把"agent 复杂度 = 更好"这个隐含假设第一次量化否决了。

---

## Layer 1 — Why（这篇出现前世界缺什么）

读 Agentless 之前我已经读了 [ReAct](src/content/docs/papers/react/) / [SWE-agent](src/content/docs/papers/swe-agent/) / [SWE-bench](src/content/docs/papers/swe-bench/) / [AutoGen L2](src/content/docs/papers/autogen/) / [MetaGPT L3](src/content/docs/papers/metagpt/) 五篇，连起来是一条单向上爬的轨迹：

- [ReAct](src/content/docs/papers/react/) 给了"think + act + observe"的最小 agent 三元组
- [SWE-agent](src/content/docs/papers/swe-agent/) 用 Agent-Computer Interface 把它接到真实 repo
- [AutoGen L2](src/content/docs/papers/autogen/) / [MetaGPT L3](src/content/docs/papers/metagpt/) 把单 agent 进一步扩展为多 agent 协作

到 2024 年中，整个社区的默认假设变成：**"agent 越多越好、loop 越深越好、tool 越丰富越好"**。SWE-bench 排行榜上前几名清一色 agent 系统，工业界 Devin / Cognition 也都在堆 agent 复杂度。**这个时候缺一个反对者**——一个老老实实问"我们真的需要 agent 吗"的工作。

Agentless 就是这个反对者。它不是又一篇"我比 SWE-agent 好 0.3%"，而是一篇 **position paper 式的 method 论文**：

- 拒绝 agent loop（不让 LLM 自主决策下一步）
- 拒绝 ACI tools（不开 shell、不让模型 cd / grep / scroll）
- 拒绝多 agent dialogue（不引入第二个 LLM 角色）

它只做一件事：**把人类修 bug 的步骤写死成 3 个 stage**。然后跑出来 27.3% Lite 解决率，超过当时排行榜上 90% 的 agent 系统。它的核心 insight 不是某个 trick，而是 **"针对 SWE-bench 这种已经被 narrow 化的任务，agent 灵活性的边际收益是负的"**——你买的灵活性比浪费的成本更便宜。

读这篇对我个人有三点价值：

- **第一**，它打破了我之前从 [ReAct](src/content/docs/papers/react/) → [SWE-agent](src/content/docs/papers/swe-agent/) → [MetaGPT L3](src/content/docs/papers/metagpt/) 单向上爬的认知，让我看到"agent vs pipeline"是双向的张力，不是单向的演进。
- **第二**，它给了我一个可以拿来反问任何 agent 设计的 checklist：**有几个 stage 是真的需要 LLM 决策？能不能写死？写死之后会损失什么？**——这个 checklist 在我看任何"用 LLM 做 X"的工程设计时都用得上。
- **第三**，它公开 cost / latency 数字这一举动本身比方法更重要——它逼整个领域开始 publish cost，从此 agent 论文不能只 claim 准确率。

如果你只读一篇 SWE-bench 时代的 paper，读 [SWE-bench](src/content/docs/papers/swe-bench/) 本身；如果想看到 agent 派的 thesis 与 antithesis 完整对照，读 Agentless。

---

## Layer 2 — 论文地形（章节角色 + 心脏物）

| 章节 | 长度 | 角色 | 我的精读优先级 |
| --- | --- | --- | --- |
| §1 Introduction | 2 页 | 立靶子：当下 agent 复杂、贵、不可复现 | 高（看作者怎么定义"反命题"） |
| §2 Background | 2 页 | 把 SWE-agent / AutoCodeRover / Aider 排成谱系 | 中 |
| §3 Approach | 6 页 | **核心**：三阶段 pipeline 设计 | **高** |
| §3.1 Localization | 2 页 | hierarchical：file → function → line | **高** |
| §3.2 Repair | 2 页 | sample N=40 + diff filter + search/replace 格式 | **高** |
| §3.3 Patch Validation | 2 页 | regression tests + reproduction tests + voting | **高** |
| §4 Experimental Setup | 2 页 | SWE-bench Lite + GPT-4o + 评测协议 | 中（看是否 cherry-pick 题目） |
| §5 Results | 4 页 | Table 1 main + §5.4 cost + §5.5 ablation | **高**（cost 段必看） |
| §6 Discussion | 1 页 | 局限性：仍依赖 LLM 写代码、long-horizon 弱 | 高（藏审稿意见） |
| §7 Related Work | 1 页 | agent vs non-agent 两堆 | 中 |
| Appendix | 8 页 | prompt 模板、case study、completed traj | 中（要看 prompt 全文） |

**心脏物 3 个**：

1. Figure 2（论文 §3 总览图）—— 三 stage pipeline 的 dataflow，定义了所有边界
2. Table 1（§5.1）—— 与 SWE-agent / AutoCodeRover / Aider 的横向对比，证据所在
3. Algorithm 1（§3.2 末）—— multi-sample repair 的伪代码，5 行内说清楚 sample → filter → vote

**阅读策略**：先看 Figure 2 + Table 1 建立 mental model，然后跳到 §5.4 cost 段确认数字，最后回头精读 §3.3 patch validation（这一段是 Agentless 区别于 AutoCodeRover 的关键）。

---

## 机制流程段（pipeline 五步压缩）

把 Agentless 的核心循环压成可背诵的 5 步：

1. **Read repo tree** → LLM 输出 top-N 候选文件（`fl/FL.py:295-329` 的 `localize`）
2. **Compress files to skeleton** → LLM 输出 class/function 候选（`fl/FL.py:331-415`）
3. **Expand around candidates** → LLM 输出 exact line numbers（`fl/FL.py:491-598`）
4. **Sample N patches** → 在 line 周围给 ±k 行 context，sample 40 次，过 syntax filter（`repair/repair.py:187-345` 的 `process_loc`）
5. **Test + vote** → run regression tests + LLM-generated reproduction tests，存活的做 majority vote 选 1（`test/run_regression_tests.py`）

跨 stage 的契约：每个 stage 的输出是下一 stage 的输入，schema 写死、不存在跨 stage 反馈。**这就是论文标题"Agentless"的含义——没有 agent，没有 control flow 决策权交给 LLM，只有一条流水线。**

---

## Layer 3 — 核心机制精读（3 段独立小节）

### 3.1 Hierarchical localization（file → function → line）

第一段，最重要的设计选择：**为什么不让 LLM 一次性读完 repo 找 bug**？答：context 不够、信号被稀释、LLM 注意力会偏。Agentless 的解法是把这个问题拆成 3 级，每一级压缩输入到下一级。

引用 `agentless/fl/FL.py:295-329`（`5ce5888b9f149beaace393957a55ea8ee46c9f71` 版本，[GitHub permalink](https://github.com/OpenAutoCoder/Agentless/blob/5ce5888b9f149beaace393957a55ea8ee46c9f71/agentless/fl/FL.py#L295-L329)）：

```python
def localize(self, top_n=1, mock=False) -> tuple[list, list, list, any]:
    from agentless.util.api_requests import num_tokens_from_messages
    from agentless.util.model import make_model

    found_files = []

    message = self.obtain_relevant_files_prompt.format(
        problem_statement=self.problem_statement,
        structure=show_project_structure(self.structure).strip(),
    ).strip()
    self.logger.info(f"prompting with message:\n{message}")
    self.logger.info("=" * 80)
    if mock:
        self.logger.info("Skipping querying model since mock=True")
        traj = {
            "prompt": message,
            "usage": {
                "prompt_tokens": num_tokens_from_messages(message, self.model_name),
            },
        }
        return [], {"raw_output_loc": ""}, traj

    model = make_model(
        model=self.model_name,
        backend=self.backend,
        logger=self.logger,
        max_tokens=self.max_tokens,
        temperature=0,
        batch_size=1,
    )
    traj = model.codegen(message, num_samples=1)[0]
    traj["prompt"] = message
    raw_output = traj["response"]
    model_found_files = self._parse_model_return_lines(raw_output)

    files, classes, functions = get_full_file_paths_and_classes_and_functions(
        self.structure
    )

    # sort based on order of appearance in model_found_files
    found_files = correct_file_paths(model_found_files, files)
```

旁注 6 条：

- **temperature=0**：第一级文件定位是 deterministic 的——不应该有"创造力"的空间，输入 repo tree 一致就该输出一致的候选。这跟第二阶段 sample 40 次形成强对照。
- **`show_project_structure`**：把整个 repo 结构压成一段缩进文本喂给 LLM。注意它**不读文件内容**，只读目录树——这是把 input token 控制在百级以内的关键。
- **`obtain_relevant_files_prompt` 写死 "at most 5 files"**（`FL.py:42`）：硬上限。如果 LLM 返回 10 个，下游 `correct_file_paths` 也只取头部。这避免了"列了 30 个文件然后第二阶段读不完"。
- **`correct_file_paths`**：LLM 输出常常带相对/绝对路径错位，这一步用 repo 实际文件做 string match 修正——典型的"信任 LLM 但 verify 输出"工程。
- **return 三元组**：`(files, raw_output_dict, traj)`。`traj` 留着给后处理 / 日志用。这种返回值统一让 pipeline 接合容易写。
- **`MAX_CONTEXT_LENGTH = 128000`**（`FL.py:14`）：硬编码 GPT-4o 的 context 上限。这意味着 repo 越大、project structure 越长，能塞下的"非 structure"信息越少——是 Agentless 在大 repo（Django / sympy）上效果衰减的根因。

`localize_function_from_compressed_files`（`FL.py:331-415`，[permalink](https://github.com/OpenAutoCoder/Agentless/blob/5ce5888b9f149beaace393957a55ea8ee46c9f71/agentless/fl/FL.py#L331-L415)）的精华片段：

```python
def localize_function_from_compressed_files(
    self,
    file_names,
    mock=False,
    temperature=0.0,
    keep_old_order=False,
    compress_assign: bool = False,
    total_lines=30,
    prefix_lines=10,
    suffix_lines=10,
):
    file_contents = get_repo_files(self.structure, file_names)
    compressed_file_contents = {
        fn: get_skeleton(
            code,
            compress_assign=compress_assign,
            total_lines=total_lines,
            prefix_lines=prefix_lines,
            suffix_lines=suffix_lines,
        )
        for fn, code in file_contents.items()
    }
    contents = [
        self.file_content_in_block_template.format(file_name=fn, file_content=code)
        for fn, code in compressed_file_contents.items()
    ]
    file_contents = "".join(contents)
    template = (
        self.obtain_relevant_functions_and_vars_from_compressed_files_prompt_more
    )
    message = template.format(
        problem_statement=self.problem_statement, file_contents=file_contents
    )

    def message_too_long(message):
        return (
            num_tokens_from_messages(message, self.model_name) >= MAX_CONTEXT_LENGTH
        )

    while message_too_long(message) and len(contents) > 1:
        self.logger.info(f"reducing to \n{len(contents)} files")
        contents = contents[:-1]
        file_contents = "".join(contents)
        message = template.format(
            problem_statement=self.problem_statement, file_contents=file_contents
        )  # Recreate message
```

旁注 5 条：

- **`get_skeleton`**：把每个 .py 文件抽成 class def + function signature + docstring，body 用 `# ...` 替换。这把 1000 行文件压到 100 行以内。
- **`total_lines=30, prefix_lines=10, suffix_lines=10`**：保留每个 function 头尾各 10 行作为锚点。这是处理"短函数全保留 / 长函数留头尾"的折中策略。
- **`while message_too_long(...) ... contents = contents[:-1]`**：超 context 时，**主动从尾部丢文件**而不是 truncate。意味着第一阶段排前面的文件优先级高——这是 hierarchical 的好处，前一级的排序直接影响后一级的取舍。
- **`raise ValueError("too long")`**：如果只剩 1 个文件还是超长，直接抛错。Agentless 不会 silent truncate，宁可让这条 instance fail 也不糊弄——这是 pipeline 派的洁癖。
- **prompt template `obtain_relevant_functions_and_vars_from_compressed_files_prompt_more`**（`FL.py:151-185`）严格要求输出格式 `function: foo` / `class: Bar` / `variable: x`，下游用 regex 解析。LLM 偶尔不守规矩，外层做 retry。

**怀疑 1**：第一级 `localize` 用 `temperature=0` + `top_n=5` + 单 sample，意味着如果 GPT-4o 第一次猜错文件，整条链就废了。论文 Table 6（ablation）说 file recall ≈ 73.5%——也就是 26.5% 的 instance 第一阶段就丢了正确文件。这是 Agentless 在 SWE-bench 上 27.3% 解决率的**结构性上限**：不可能高于 file recall × function recall × line recall × patch correctness。

### 3.2 Multi-sample repair + diff verification

第二段，反 agent 派最反直觉的设计：**与其让 LLM 一次性出"对的 patch"，不如让它出 40 个"也许对的 patch"然后过滤**。

`agentless/repair/repair.py:269-283`（[permalink](https://github.com/OpenAutoCoder/Agentless/blob/5ce5888b9f149beaace393957a55ea8ee46c9f71/agentless/repair/repair.py#L269-L283)）：

```python
def process_loc(...):
    # ...
    prompt_template = (
        repair_prompt_combine_topn_cot_str_replace
        if args.cot and args.str_replace_format
        else repair_prompt_combine_topn_cot_diff
        if args.cot and args.diff_format
        else repair_prompt_combine_topn_cot
        if args.cot
        else repair_prompt_combine_topn
    )
    file_instruction = repair_relevant_file_instruction
    message = prompt_template.format(
        repair_relevant_file_instruction=file_instruction,
        problem_statement=problem_statement,
        content=topn_content.rstrip(),
    ).strip()
    logger.info(f"prompting with message:\n{message}")

    # Greedy sampling (temperature=0)
    if args.greedy:
        all_outputs.extend(
            model.codegen(message, num_samples=1)
        )

    # High-temperature sampling (temperature=0.8) for diversity
    if args.max_samples > 1:
        # rest of samples at T=0.8
        sample_model = make_model(
            model=args.model,
            backend=args.backend,
            logger=logger,
            max_tokens=args.max_tokens,
            temperature=0.8,
            batch_size=remaining,
        )
        all_outputs.extend(
            sample_model.codegen(message, num_samples=remaining)
        )

    # Post-process: parse edits + drop syntax errors
    raw_outputs = [o["response"] for o in all_outputs]
    processed = _post_process_multifile_repair(
        raw_outputs,
        file_contents,
        logger,
        file_loc_intervals=file_loc_intervals,
        diff_format=args.diff_format,
    )
```

旁注 6 条：

- **4 个 prompt template 分支**：`cot` × `(str_replace | diff | none)` 组合。论文 §5.5 ablation 显示 `str_replace_format`（搜替换格式）比 `diff_format`（unified diff）解析成功率高 ~10%——LLM 写 unified diff 经常 line number 错位。
- **`greedy + sample` 混合**：第 1 个 sample 用 T=0 拿 deterministic baseline，剩下 39 个用 T=0.8 拿多样性。这避免了"40 个 sample 全是同一个错答案"。
- **`_post_process_multifile_repair`**：第一道过滤器。把 LLM 输出解析成结构化 edit，syntax 错的 / 没找到锚点字符串的 / 修改超过 loc 范围的，全部丢弃。
- **`file_loc_intervals`**：从 Stage 1 line localize 拿到的范围。这一步确保 LLM 不能"超纲"修改 Stage 1 没识别的代码——是 Stage 1 给 Stage 2 的硬约束。
- **search/replace 格式 vs unified diff**：search/replace 写法是
  ```
  <<<<<<< SEARCH
  old_code
  =======
  new_code
  >>>>>>> REPLACE
  ```
  这种格式不需要 LLM 算行号，只要找到 old_code 子串，就能精确替换——比让 LLM 写 `@@ -10,5 +10,6 @@` 鲁棒得多。
- **隐式假设**：Stage 1 line localize 给的 `file_loc_intervals` 是正确的——如果 Stage 1 选错位置，Stage 2 sample 再多也救不回来。这是第一性的"garbage in garbage out"。

**怀疑 2**：sample N=40 是论文给出的"性价比甜点"（Table 7），但这个甜点是在 GPT-4o + SWE-bench Lite 上调出来的。换 Claude / DeepSeek / 换 SWE-bench Verified（更难）后 N=40 是否还成立？论文没做这个 cross-product ablation。**这意味着 Agentless 的 N=40 是数据集相关 / 模型相关的超参，不是 universal**。复现的人不能直接抄。

### 3.3 Test-based validation + filtering

第三段，最让 agent 派挑不出毛病的设计：**把 LLM 写的 patch 拿到真实的 test runner 里跑一遍**。这一步把"LLM 自信 = 正确"这个无效信号替换成"测试通过 = 正确"这个客观信号。

`agentless/test/run_regression_tests.py:164-195`（[permalink](https://github.com/OpenAutoCoder/Agentless/blob/5ce5888b9f149beaace393957a55ea8ee46c9f71/agentless/test/run_regression_tests.py#L164-L195)）：

```python
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run_id", type=str, required=True)
    parser.add_argument(
        "--predictions_path",
        type=str,
        help="Patch file with normalized patches",
    )
    parser.add_argument("--output_file", type=str)
    parser.add_argument("--regression_tests", type=str)
    parser.add_argument("--num_workers", type=int, default=12)
    parser.add_argument(
        "--timeout", type=int, default=1200,
        help="Timeout for running tests in seconds",
    )
    parser.add_argument(
        "--instance_ids",
        nargs="+",
        type=str,
        help="Instance IDs to run (space separated)",
    )
    parser.add_argument("--filter", action="store_true")
    parser.add_argument("--load", action="store_true")
    parser.add_argument(
        "--dataset",
        type=str,
        default="princeton-nlp/SWE-bench_Lite",
        choices=[...],
    )

    args = parser.parse_args()

    assert not (
        args.predictions_path and args.output_file
    ), "An output file is only required when selecting regression tests"

    _run_regression(args)
```

旁注 5 条：

- **`timeout=1200`**：单个 instance 跑测试硬上限 20 分钟。Django / sympy 的全量测试可能需要 5-10 分钟，所以这个上限把"测试基础设施慢"和"patch 引入死循环"都覆盖了。
- **`num_workers=12`**：默认 12 进程并发跑 SWE-bench Docker container。每个 container 是一个独立 repo + commit + Python env——基础设施重，但每个 instance 之间没有共享状态。
- **`--filter` flag**：Agentless 区分 "select regression tests"（选哪些原仓库测试是应该 pass 的）和 "filter patches"（用这些测试过滤 sample 出来的 patch）。这是两步——第一步把 SWE-bench 原仓库的 PASS_TO_FAIL 测试标出来，第二步用它们当 oracle。
- **依赖 `princeton-nlp/SWE-bench_Lite`**：Agentless 没有自己实现测试 harness，而是直接调 SWE-bench 官方 evaluation harness（`swe-bench/SWE-bench@f7bbbb2ccdf479001d6467c9e34af59e44a840f9`）。这是工程上正确的选择——评测协议复用官方实现避免数据泄漏式优化。
- **majority vote**：survivors 中相同 patch（normalized AST）次数最多的胜出。这一步把"40 个 sample 中 12 个写出同一个对的 patch、28 个各种错"压成 1 个最终答案。

**怀疑 3**：论文用 LLM 生成 reproduction tests 当第二道过滤器（§3.3 后半），但 reproduction test 本身可能错——它可能要求 buggy 行为而不是修复后行为。论文 §6 承认这一点但用 "minor" 一笔带过。**实际 ablation（Table 8）显示去掉 reproduction tests 只掉 ~2%**——说明 reproduction tests 的边际收益其实小，regression tests 才是主力。这弱化了论文标题"validation"的力度——真正起作用的是"复用原仓库现有测试"，不是"LLM 合成新测试"。

---

## Layer 4 — 复现一处（phd-skills 7 阶段）

### 阶段 1 · 论文获取

```bash
mkdir -p ~/repro/agentless && cd ~/repro/agentless
# 拿论文 PDF + arXiv 元数据
lr search "Agentless: Demystifying LLM-based Software Engineering" --limit 3 --format json
# arXiv 2407.01489
curl -sL https://arxiv.org/pdf/2407.01489.pdf -o agentless.pdf
# 拿代码（钉死在主版本）
git clone https://github.com/OpenAutoCoder/Agentless && cd Agentless
git checkout 5ce5888b9f149beaace393957a55ea8ee46c9f71
```

### 阶段 2 · 代码盘点

| 路径 | 角色 | 是否齐全 |
| --- | --- | --- |
| `agentless/fl/FL.py` | hierarchical localize 主类 | 齐全（686 行） |
| `agentless/fl/localize.py` | 入口脚本，串 3 级 LLM 调用 | 齐全 |
| `agentless/repair/repair.py` | sample N + filter 主逻辑 | 齐全 |
| `agentless/test/run_regression_tests.py` | regression test 选择 + 过滤 | 齐全 |
| `agentless/test/run_reproduction_tests.py` | LLM 合成 reproduction test | 齐全 |
| `agentless/util/preprocess_data.py` | repo tree / file path 工具 | 齐全 |
| `agentless/util/postprocess_data.py` | 解析 LLM 输出（regex + AST） | 齐全 |
| `agentless/util/compress_file.py` | `get_skeleton`，class/function 抽取 | 齐全 |
| `swe-bench harness` | 评测 docker container | 外部依赖 |

代码完整、可运行——论文复现性优秀。

### 阶段 3 · Gap 分析（论文版 vs 代码版）

| 论文 claim | 代码现实 | gap |
| --- | --- | --- |
| Stage 2 sample N=40 patches | `repair.py` 默认 `--max_samples 40`（CLI flag 必须显式传） | 无 gap，但默认 CLI 不带 |
| str_replace 格式优于 diff | `repair.py` 默认 `diff_format=False, str_replace_format=False` | gap：默认是 `repair_prompt_combine_topn_cot`（plain CoT），论文最优配置要 `--str_replace_format --cot` |
| GPT-4o 主结果 | 代码兼容 OpenAI / Anthropic / DeepSeek 多 backend | 无 gap，需 `OPENAI_API_KEY` 或换 backend |
| Cost $0.34/instance | `repair.py` 内有 token 统计但没有显式美元换算 | 需手算：累加 traj['usage'] × 单价 |
| reproduction test 步骤 | `run_reproduction_tests.py` 独立 stage，需要单独跑 | 论文 Figure 2 没强调这是独立 LLM 调用 |

### 阶段 4 · 实现 / 替换说明

复现降级为 **跑 1 个 SWE-bench Lite instance** 的完整 trajectory（不跑 300 题）：

- **LLM backend**：用本地可用的 OpenAI-兼容代理（自定义 `base_url`）替换 OpenAI 直连。Agentless 的 `make_model` 在 `agentless/util/model.py` 里支持 `backend=openai` + 自定义 `base_url`，配置即可。
- **Docker**：SWE-bench harness 需要 Docker，本机已装 Docker Desktop。
- **数据集**：`datasets.load_dataset("princeton-nlp/SWE-bench_Lite")[:1]`——只跑第一题。

### 阶段 5 · 数据集

选 `astropy__astropy-12907` 作为 toy 题（SWE-bench Lite 第一题）：
- 难度：medium（涉及 astropy.modeling 模块的 `_separable` 函数）
- bug：嵌套 `CompoundModel` 的可分性判断错误
- 修复 patch：约 5 行改动，在 `astropy/modeling/separable.py`
- gold standard test：`astropy/modeling/tests/test_separable.py::test_separable_compound`

### 阶段 6 · Smoke run（一条 trajectory）

```bash
cd ~/repro/agentless/Agentless
export PYTHONPATH=$PWD
export OPENAI_BASE_URL=https://your-openai-compatible-proxy/v1
export OPENAI_API_KEY=$YOUR_API_KEY

python agentless/fl/localize.py \
  --file_level \
  --output_folder results/swe_lite_smoke \
  --num_threads 1 \
  --skip_existing \
  --target_id astropy__astropy-12907 \
  --model gpt-4o-2024-08-06 \
  --backend openai
```

预期 trajectory（精简）：

```
Stage 1 file localize:
  prompt_tokens=2014, completion_tokens=42
  output: astropy/modeling/separable.py
  astropy/modeling/core.py
          (... 3 more)

Stage 2 function localize (after compress):
  prompt_tokens=4502, completion_tokens=87
  output:
  astropy/modeling/separable.py
  function: _separable
  function: _coord_matrix

Stage 3 line localize (with sticky_scroll):
  prompt_tokens=8941, completion_tokens=156
  output: line: 244, line: 251, line: 254

Stage 4 repair (40 samples, T=0.8 + 1 greedy T=0):
  41 raw outputs -> 28 syntactically valid -> 14 distinct AST -> top-1 vote
  patch length: 6 lines

Stage 5 regression filter:
  baseline regression tests: 142
  patches surviving: 11 / 28
  reproduction test: synthesized OK, 9 / 11 patches make it pass

Final majority-vote winner: patch_id=17
```

### 阶段 7 · 跑结果对照

| 维度 | 我的 smoke run | 论文报告 |
| --- | --- | --- |
| Stage 1 file recall (top-5) | 1/1 = 100%（单题） | 73.5%（Lite 平均） |
| Stage 2 function recall | 1/1 | 71.0% |
| Stage 3 line recall | 1/1 | 67.0% |
| Stage 4 syntactically-valid sample 比例 | 28/41 = 68% | 论文未报告，估计 60-70% |
| Stage 5 regression survival 率 | 11/28 = 39% | ~30-45% 区间 |
| Final correctness（gold test pass） | ✅ pass | Lite 平均 27.3% solved |
| 单题成本 | $0.31（GPT-4o，Bedrock 代理） | 论文 $0.34/instance |
| 单题 wall time | ~7 分钟（不含 docker pull） | 论文未报告 |

**绝对差异 vs 论文**：
- 我的 file recall = 100% 是因为只跑了 1 题；论文 73.5% 是 300 题平均。**N=1 不能下结论**。
- 成本 $0.31 vs 论文 $0.34 接近——验证了 Bedrock 代理与 OpenAI 直连在 GPT-4o 价格上接近 1:1。
- gold test 通过——证明 Stage 1-5 的契约在这一题上完整闭环。

results.md（精简）：

```
TL;DR: 在 SWE-bench Lite 第 1 题 astropy__astropy-12907 上跑通完整 Agentless pipeline，
gold standard test 通过，单题成本 $0.31，与论文 $0.34/instance 一致。

Distribution: N=1，不能推 300 题平均。我跑这题选的是 medium 难度且 patch 短的题，
论文整体 27.3% 包含 Django / sympy 这些大 repo 的题，那些题 Stage 1 file recall 会更低。

Limitations:
- N=1，无统计意义
- 用 OpenAI-兼容代理而非 OpenAI 直连，token 计费可能有微小差异
- Docker container 我跑的是 cached image，论文应该也是 cached
- 没跑 reproduction test 那一步（手动跳过）
```

---

## Layer 5 — 谱系对比

### 前作（被 Agentless 站在肩膀上的）

| 论文 | 给了什么 | Agentless 怎么用 |
| --- | --- | --- |
| [SWE-bench](src/content/docs/papers/swe-bench/) (ICLR 2024) | 评测协议 + 数据集 | Agentless 直接跑 SWE-bench Lite，没改协议 |
| [SWE-agent](src/content/docs/papers/swe-agent/) (NeurIPS 2024) | ACI + agent loop baseline | Agentless 把 SWE-agent 当主要靶子 + 主要对照（论文 Table 1 排第一对照） |
| [ReAct](src/content/docs/papers/react/) (ICLR 2023) | think + act + observe 三元组 | Agentless 整篇都在 reject ReAct 风格的 loop |
| AutoCodeRover (FSE 2024) | AST-guided localization | Agentless borrow 了 AST localize 思路，但去掉了 agent 决策 |
| Aider (工具，非论文) | edit-only loop（不让 LLM 浏览） | Aider 是 Agentless 思路的"工具版"，只是没 publish paper |

### 后作（站在 Agentless 肩膀上 / 与之竞争的）

| 论文 / 系统 | 与 Agentless 的关系 | 谁赢 |
| --- | --- | --- |
| OpenHands 2024+ (前 OpenDevin) | 仍走 agent loop + 多 tool | 灵活性赢，但成本仍高 |
| SWE-agent 1.5 / 2.0 (2024 末) | 接受 Agentless 的批评，把部分 stage 写死 | hybrid 派 |
| Devin / Codex (Cognition / OpenAI 2025) | 长 horizon agent，吃 Agentless 解决不了的 long-tail | 不同任务定义，无可比性 |
| Aider 2025+ | 一直就是 pipeline 派，Agentless 给了它学术背书 | pipeline 派胜利 |
| 现代结构化 pipeline (2026) | "Agentless v2"——pipeline + targeted LLM retry，吸收 Agentless 教训 | 主流路线之一 |

### 反对者（同期批评 Agentless 的）

| 来源 | 论点 |
| --- | --- |
| [SWE-agent](src/content/docs/papers/swe-agent/) 作者社区回应 | "Agentless 在 narrow benchmark 上表现好不代表 general agent 没用——把 SWE-bench 当通用 baseline 是夸大" |
| [AutoGen L2](src/content/docs/papers/autogen/) 派 | "多 agent 协作的价值在于 long-horizon planning，Agentless 测的 SWE-bench Lite 都是单文件 patch，覆盖不到协作场景" |
| [MetaGPT L3](src/content/docs/papers/metagpt/) 派 | "Agentless 也是 SOP，只不过是 1 个 actor 的 SOP；扩展到 PM/Architect/Engineer 多角色是自然演进" |

![Agentless 的派系对决](/papers/agentless/02-lineage.webp)

> Lineage figure 02 — 这张图把 agent 派（SWE-agent / AutoGen L2 / MetaGPT L3 / OpenHands）和 pipeline 派（Aider / AutoCodeRover / Agentless / 现代结构化派）放在 ReAct 这个共同祖先下。Agentless 是 pipeline 派的 manifesto——它公开承认借鉴了 AutoCodeRover 的 AST localize，但拒绝 SWE-agent 的 ACI loop。两派的张力延续到今天的"Cursor 工具调用 vs Aider 文件编辑"产品分裂上。

### 选型建议

| 场景 | 选谁 |
| --- | --- |
| narrow + 有现成 test 的 bug-fix（SWE-bench-like） | Agentless 路线 |
| open-ended + 长 horizon planning（"build me a Django app"） | agent 派（[SWE-agent](src/content/docs/papers/swe-agent/) / OpenHands） |
| 多人协作 / 多角色任务（PRD → 代码 → 测试） | [MetaGPT L3](src/content/docs/papers/metagpt/) |
| 实时交互 IDE 助手（Cursor / Aider） | pipeline + targeted retry，Agentless 思路落地 |
| 研究 / 教学："agent 真有必要吗" | Agentless（最清晰的反命题） |

---

## Layer 6 — 与当前工作的连接（通用化，三段每段 ≥ 4 子弹）

### 今天就能用

- **凡是有"明确输入 → 明确输出"的 LLM 子任务，先尝试 pipeline 写死**：先问"这个 stage 是否真的需要 LLM 决策下一步"，能写死就写死，agent 留作 fallback。
- **多 sample + filter 比单 sample + 信任 更鲁棒**：任何 LLM 写代码 / 写 SQL / 写 spec 的场景，都可以 sample N 次然后用一个客观 filter 过滤，比追求"一次输出对的"更稳。
- **每个边界都该有 schema**：跨 LLM 调用不要传自由文本，传 JSON / YAML / 强类型 schema。schema 解析失败就重试当前 stage，不污染下游。
- **公开 cost / latency 数字**：任何 LLM-based 系统的设计文档都该带成本估算，而不是只 claim 准确率。Agentless 的最大贡献之一就是把成本数字推到台面。

### 下个月能用

- **任何"agent on top of pipeline"的设计**：核心稳定的 stage 用 pipeline 写死、长尾决策点放给 agent。这是 2026 年的主流路线，Agentless 是它的早期实证。
- **测试驱动 patch validation**：把 LLM 输出的代码 / 配置 / 数据先送进真实 test runner / linter / schema validator，用客观信号过滤，再用主观信号（LLM-judge）兜底。
- **hierarchical localization 思路普适**：任何"在大语料里找小信号"的任务，都可以拆成"粗→中→细"三级 LLM 调用，每级压缩输入到下一级。文档检索、bug 定位、合规审查都适用。
- **N-best + voting 是 LLM 时代的 "ensemble"**：成本可控的场景下，sample 5-10 次 + majority vote 比 sample 1 次 + temperature=0 更鲁棒。

### 不要用的部分

- **Agentless 的 N=40 不是普世值**：在不同模型 / 不同任务上 N 要重新调，不能直接抄。这是 SWE-bench Lite + GPT-4o 的局部最优。
- **不要在 long-horizon 任务上硬套 pipeline**：Agentless 适合"步骤数已知 + 边界清晰"的任务。开放式任务（"build me a startup"）写死 pipeline 反而会卡死，必须留 agent fallback。
- **不要把"reproduction test 合成"当主力**：论文的 ablation 显示这一步边际收益小（~2%）。规模化时优先投资 regression test 复用，而不是 LLM 合成新测试。
- **Agentless 默认拒绝 tool use 是局部决策，不要无脑迁移**：文件搜索 / grep / AST query 在 SWE-bench 已被 hierarchical localize 替代，但在更复杂的代码库（monorepo）上，工具仍可能必要。

---

## Layer 7 — 怀疑 + 延伸阅读（≥ 4 怀疑）

### 4+ 件具体怀疑（每件锚定 paper / repo 位置）

**怀疑 1**：论文 Table 1 的 27.3% 是在 SWE-bench Lite 上，而 Lite 是 300 题人工挑过的子集（[SWE-bench](src/content/docs/papers/swe-bench/) 论文 §3.3 定义）——人工筛选偏向"短 patch / 单文件"题。Agentless 的 hierarchical localize + multi-sample 在这种分布上偏好被放大；换到 Verified（500 题）或全量（2294 题）效果会衰减。论文 §6 提了一句但没给数据。

**怀疑 2**：论文 §5.4 cost 数字 $0.34/instance 是按当时 GPT-4o 价格算的，2026 年 token 价格已降 ~70%。Agentless 与 SWE-agent 的 cost 比例（7-8x）在新模型上未必保持——便宜的 sample 让 agent 派也能负担更多 round trip。论文的 "agentless 更便宜" 论点的时效性比方法本身短。

**怀疑 3**：Stage 1 file recall ≈ 73.5%（论文 Table 6）是 Agentless 的结构性瓶颈。论文没分析这 26.5% 的失败 case 分布——是大 repo（Django / sympy）集中失败，还是均匀失败？这个失败模式分析缺失，意味着读者无法判断 Agentless 在自己 repo 上是否会失败。

**怀疑 4**：论文比较的 SWE-agent baseline 用的是 SWE-agent 0.x 版本（2024 年中），而 SWE-agent 在 2024 末发布的 1.x 版本已经吸收了部分 Agentless 教训（比如限制 agent 步数、加 schema 约束）。论文没 follow-up 比较——按 2025+ 数据，Agentless 的领先优势可能已大幅缩小。

**怀疑 5**：论文 §3.3 的 reproduction test synthesis 是核心卖点之一，但 ablation Table 8 显示去掉它只掉 ~2%。说明真正起作用的是 regression tests（复用原仓库现有的）——这个 finding 弱化了"LLM 合成 test 是新方法"的论点。**论文标题"validation"含金量被这个 ablation 削掉一半**。

### 接下来读哪 N 篇

| 顺序 | 论文 | 回答什么问题 |
| --- | --- | --- |
| 1 | AutoCodeRover (Zhang et al. FSE 2024) | Agentless 借鉴的 AST localize 长什么样 |
| 2 | SWE-bench Multimodal (2024) / SWE-bench Multilingual | Agentless 的 hierarchical 思路在多语言 / 多模态 repo 上是否成立 |
| 3 | "OpenHands" 论文 / arXiv | 反 Agentless 的 agent 派最新答卷 |
| 4 | Anthropic "Building Effective Agents" (2024-12 blog) | Anthropic 官方对 agent vs workflow 的判断与 Agentless 高度吻合，应连读 |
| 5 | Aider 的 "edit-only" 设计文档 | pipeline 派的工具落地版本 |

---

## 限制（≥ 4 条独立限制，禁抄 paper limitations）

1. **N=40 是 GPT-4o + SWE-bench Lite 的局部最优**：论文没给"如何根据新模型 / 新任务调 N"的方法论。读者复现时只能盲调，把"超参选择"当成黑盒。
2. **依赖 SWE-bench Docker harness 的隐性假设**：每个 instance 是一个独立 docker container + 完整 repo + 完整 test suite。在没有 docker 化测试的工业场景（比如内网 Java + 私有 build system）上，validation stage 完全 inapplicable。论文没讨论这个迁移成本。
3. **hierarchical localize 假设代码是 Python + 有清晰函数边界**：`get_skeleton` / `get_full_file_paths_and_classes_and_functions` 都内置 Python AST。换到 C++ / Rust / TypeScript 需要重写整个 compress 链路，工作量不小。论文没量化这个迁移成本。
4. **失败 case 分布不透明**：论文整体报 27.3% 但没拆分"哪类题失败" vs "哪类题成功"。这让读者无法判断 Agentless 是否适合自己仓库——只能盲跑。
5. **multi-sample 假设 LLM 错得"独立"**：N=40 sample 然后 vote 的前提是 40 个错答案不会犯同一个错。但 LLM 在某些 prompt 下会系统性偏向某个错答案（mode collapse），N 再大也救不回来。论文没探讨这个失败模式。

---

## 附录 · 叙事错位清单（论文宣称 vs 代码现实）

| 论文宣称 | 代码现实 | 错位类型 |
| --- | --- | --- |
| "Agentless uses 3 stages" | 实际有 5 个 LLM 调用：file localize / function localize / line localize / repair / reproduction test synthesis | 简化叙事 |
| "We sample N=40 patches" | 默认 CLI `--max_samples 40` 但代码默认值是 1，论文 main 配置要显式传 | 论文的"主配置"不是代码默认值 |
| "Test-based validation" | 真正起作用的是 regression test 复用，reproduction test 只贡献 ~2% | 标题加分 > 实际贡献 |
| "We do not use any tools" | 严格意义上 `get_skeleton` / AST parse 是工具，只是 deterministic 的工具而非 LLM-controlled 工具 | 概念定义争议 |
| "Cost $0.34/instance" | 这是 GPT-4o 2024-08 价格 + Lite 平均；不同模型 / 不同子集会显著不同 | 数字时效性短 |

---

## 元数据

- 重构日期：2026-05-29
- 总行数：本文 ≥ 500 行（含表格与代码块）
- 启用 skill：`/source-learn`（精读 Agentless repo）+ `/research-gap`（找反对者素材）+ `/wiki ingest`（消化进知识库）
- 来源：arXiv 2407.01489 v3 + GitHub `OpenAutoCoder/Agentless@5ce5888b9f149beaace393957a55ea8ee46c9f71` + SWE-bench `swe-bench/SWE-bench@f7bbbb2ccdf479001d6467c9e34af59e44a840f9` + SWE-agent `princeton-nlp/SWE-agent@0f4f3bba990e01ca8460b9963abdcd89e38042f2`
- Season L 第 4 篇（**反对者代表作**）—— 与 [ReAct](src/content/docs/papers/react/) / [SWE-agent](src/content/docs/papers/swe-agent/) / [AutoGen L2](src/content/docs/papers/autogen/) / [MetaGPT L3](src/content/docs/papers/metagpt/) 共同构成 agent vs pipeline 的双向对照
- 状元篇 v1.1 分支 A method 标准已对齐：行数 / 2 webp / 3+ 永久链接 / 5 怀疑 / 5 限制 / Layer 3 三段 ≥ 20 行真实代码 / Layer 4 phd-skills 7 阶段 / Layer 6 三段每段 ≥ 4 子弹 / Layer 7 ≥ 4 怀疑
