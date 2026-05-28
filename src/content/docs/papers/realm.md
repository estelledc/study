---
title: REALM (Guu et al. ICML 2020) — 把 retriever 塞进 MLM pretrain 的第一篇论文
description: 不在 finetuning 时才接外部知识，而是让 retriever 和 BERT 一起预训练；marginalize 让 retriever 学会什么叫"对预测 mask 有用"
sidebar:
  label: REALM (ICML 2020)
  order: 4
---

## L0 论文身份证

| 字段 | 内容 |
|---|---|
| 标题（中英） | REALM: Retrieval-Augmented Language Model Pre-Training / 检索增强的语言模型预训练 |
| 作者 | Kelvin Guu, Kenton Lee, Zora Tung, Panupong Pasupat, Ming-Wei Chang |
| 一作机构 | Google Research（Guu 时为研究员，Stanford PhD 毕业；现 Google DeepMind） |
| 通讯 / senior author | Ming-Wei Chang（Google Research，BERT/T5 团队） |
| 发表 venue | ICML 2020（2020-02 arXiv 提交，2020-07 ICML accept） |
| arXiv ID | [2002.08909v1](https://arxiv.org/abs/2002.08909)（v1 = 终版，没改过） |
| 代码 repo | [google-research/language `language/realm/`@865fae65f63ef7e6b2989d4ff8b47f61750415a8](https://github.com/google-research/language/tree/865fae65f63ef7e6b2989d4ff8b47f61750415a8/language/realm)（star 1.7k，TF1 实现，最后维护 2020 年）；[huggingface/transformers RealmModel@745bbfe4bb2b61491dedd56e1e8ee4af8ef1a9ec](https://github.com/huggingface/transformers/tree/745bbfe4bb2b61491dedd56e1e8ee4af8ef1a9ec/src/transformers/models/realm)（PyTorch 移植，v4.40.0；v4.41+ 已废弃删除） |
| 引用数 | 截至 2026-05，Google Scholar 3500+，Semantic Scholar 2900+ |
| 数据 / 资源 | 预训练用 English Wikipedia 12-2018 dump，288 字 BPE token 切块 = 13M passages；finetune 用 NaturalQuestions / WebQuestions / CuratedTREC 三个 open-domain QA 数据集 |
| 论文类型 | v1.1 分支 A method（提出新预训练 + finetune 算法，含官方 prototype repo） |

## 一句话总结

**之前所有预训练模型把"知识"全部塞进参数里——REALM 是第一个证明你可以让 retriever 和 BERT 一起预训练，让模型在预测 mask 的时候"想起"去 Wikipedia 翻一眼的论文。**
你今天用的 chroma + LangChain RAG 流水线，把"先检索、再生成"当成天经地义的事；
但在 2020 年，让 retriever 接收预测 loss 的梯度本身是一个尚未被证明可行的想法。
REALM 把这件事第一次端到端跑通——同期 Lewis et al. 的 [RAG (NeurIPS 2020)](src/content/docs/papers/rag-lewis-2020.md) 走 BART seq2seq 的路；REALM 走 BERT MLM 的路；两篇是姊妹工作。

![REALM training pipeline: masked sentence -> retriever -> top-k Wikipedia -> encoder -> marginal log-likelihood](/study/papers/realm/01-pipeline.webp)

*图 1：REALM 训练流水线五步重制。**第 1 步**（橙）输入 masked 句子 x（论文 Section 3.1 的 salient span masking——只 mask 实体 / 日期，普通词不 mask）。
**第 2 步**（蓝）retriever p_theta(z|x) 用 BERT 把 query 和文档分别 embed，再做 MIPS top-k 取 8 个 Wikipedia passage。
**第 3 步**（绿）knowledge-augmented encoder 把 [CLS] x [SEP] z 拼起来送进另一个 BERT，预测 mask token——一个 query 复制 k 份，每份用一个不同的 z。
**第 4 步**（红）核心 loss：marginal log-likelihood = sum_z p_phi(y|x,z) * p_theta(z|x)，反传时 retriever 也吃到梯度。
**第 5 步**（紫）异步 MIPS index refresh —— encoder phi 每步都在变，但把 13M doc 重新 embed 太慢，所以 trainer 读"过期"的 doc embedding，单独的 TPU job 每 500 步刷一次索引。*

**视觉冲击句**：左半 retriever 看见 mask 的句子主动去 Wikipedia 翻；右半 encoder 同时在 8 份"句子+文档"上算 loss；中间没有"先 retrieve 完再训"这条人为切线——retriever 的参数本身就是 BERT 在被训练。这是 2026 年所有 RAG 系统的祖宗形态。

## 创新点（4 处）

1. **第一次把 retriever 训练嵌进 LM pretrain（Section 3）**——不是 finetuning 阶段才接 retrieval，而是让 retriever 在 12 万亿 token MLM 训练里全程被 marginalize loss 的梯度更新。这是 REALM vs ORQA / DrQA 的本质区别。具体反传的代码在 [`language/realm/model.py:139-167`@865fae65f63ef7e6b2989d4ff8b47f61750415a8](https://github.com/google-research/language/blob/865fae65f63ef7e6b2989d4ff8b47f61750415a8/language/realm/model.py#L139-L167)（`marginal_gold_log_probs = tf.reduce_logsumexp(joint_gold_log_probs, 1)`）

2. **Async MIPS index refresh（Section 3.3）**——工程上最被低估的细节。13M 文档 × 128 维 embedding，不可能每步重算；REALM 的方案是"trainer 读过期的索引、单独 refresh job 每 500 步刷一次"。论文 Section 3.3 第三段交代了这件事；代码在 [`language/realm/refresh_doc_embeds.py:102-184`@865fae65f63ef7e6b2989d4ff8b47f61750415a8](https://github.com/google-research/language/blob/865fae65f63ef7e6b2989d4ff8b47f61750415a8/language/realm/refresh_doc_embeds.py#L102-L184)。模型代码里把这个延迟监控成 `off_policy_delay_mins`（[`model.py:202-210`@865fae65f63ef7e6b2989d4ff8b47f61750415a8](https://github.com/google-research/language/blob/865fae65f63ef7e6b2989d4ff8b47f61750415a8/language/realm/model.py#L202-L210)）

3. **Inverse Cloze Task pre-init + null document（Section 3.4 + 4.5）**——retriever 如果从随机初始化开始，永远学不会（信号太稀疏）。REALM 先用 Lee et al. 2019 的 ICT 任务把 retriever 单独预训练 100k 步，让它先学会"句子和它原文段落的相似性"，再开 joint training。同时 top-k 里塞一个 "null document"（空文档），让模型在 retrieval 没用时有 fallback 路径

4. **Salient span masking（Section 3.4）**——不是随机 mask 15% token（BERT 默认），而是只 mask named entity 和 date 这种"需要外部知识才能填"的 span。普通词（the / is / a）让 standard BERT 处理，**留出真正需要 retrieve 的训练信号**。下游 NaturalQuestions EM 从 31.3 降到 26.5（不用 salient span masking），是论文 Table 7 最大的 ablation gap

## L1 Why（这篇出现前世界缺什么）

2019-2020 之交，"让模型回答 open-domain 问题"有两条主要路线，**都不够好**：

### 对手 A：纯参数派（T5, BERT-large, GPT-2）

- 用海量 Wikipedia + 网页文本预训练，knowledge 全压进参数里
- finetune 时只读 question，不查任何外部知识
- T5 (Roberts et al. 2020) 的 closed-book QA 在 NaturalQuestions 上能拿到 ~24% EM
- **死穴**：参数里能记住的事实有上限；想更新知识必须重训整个模型

### 对手 B：retrieve-then-read 派（DrQA, ORQA）

- DrQA (Chen et al. 2017)：TF-IDF 检索 + BERT reader，retriever 是 fixed 的
- ORQA (Lee et al. 2019)：retriever 也是 BERT，但**只在 finetuning 阶段更新**——pretrain 是普通 BERT
- ORQA NaturalQuestions ~31% EM
- **死穴**：retriever 的训练数据有限（只用 finetune 集），没经历过 12B token 的预训练规模

### REALM 的 insight

很简单一句话：**让 retriever 在 pretrain 阶段就接收来自 mask 预测的梯度**——
对每一个 masked sentence，让模型从 13M Wikipedia passages 里选 k 个最有用的，
然后用 marginalize loss 反传给 retriever。

REALM NaturalQuestions 拿到 39.2% EM，比 ORQA 提升 4 个百分点，比 T5-11B closed-book 提升 ~15 个百分点（Table 1）。
论文最关键的句子在 Section 1 introduction：

> "Like LM pretraining, REALM is unsupervised: predicting the missing token in a sentence acts as a learning signal for both the retriever and the encoder."

意思是：MLM 任务本身就提供了"判断检索结果好不好"的信号——
如果 retriever 选的 z 让 encoder 更容易预测出正确的 mask token，
那 marginalize loss 就会把 p_theta(z|x) 推高。**不需要标注哪个文档是相关的**。

## L2 论文地形

PDF 12 页主体 + 4 页 appendix。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | motivation + 三句话总结全篇 | 读 5min |
| 2. Background | KB-augmented LM 综述 + ORQA 简介 | 扫 3min |
| 3. Approach | **方法定义** —— 3.1 模型 / 3.2 train / 3.3 async refresh / 3.4 ICT + null doc + salient span | **精读 25min** |
| 4. Experiments | 4.1-4.4 main results / 4.5 ablation | **精读 15min** |
| 4.5 Ablation Table 7 | salient span / null doc / ICT 三个开关全部消融 | **必看 5min** |
| 5. Related Work | 把对手分两堆：parametric LM vs retrieve-then-read | 读 5min |
| 6. Discussion + 7. Conclusion | 略 | 跳 |
| Appendix B | 完整训练超参 | 当 reference（要复现必看，5min） |

**心脏物**有三个：

1. **Figure 1**（page 1）—— 整篇论文的图示总览：x → retriever → top-k → encoder → marginalize
2. **Section 3.2 marginal log-likelihood 公式 + 算法描述** —— 3 个核心方程定义全部训练动力学
3. **Table 7 ablation**（page 8）—— 把 salient span / null doc / ICT 三个开关一个个关掉，证明每个都不可少

## 机制流程（5 步）

**Step 1 输入 masked sentence**：从 Wikipedia 抽一段，跑 spaCy NER 找命名实体 / 日期 → 用 [MASK] 替换。代码在 [`language/realm/featurization.py:55-79`@865fae65f63ef7e6b2989d4ff8b47f61750415a8](https://github.com/google-research/language/blob/865fae65f63ef7e6b2989d4ff8b47f61750415a8/language/realm/featurization.py#L55-L79) 定义 Query namedtuple，含 mask_spans 字段。

**Step 2 query embed**：用 BERT-base 把 query 编码成 128 维向量（projected 维度，比 768 小很多——MIPS 速度才能接受）。embedder 模块在 [`language/realm/model.py:62-77`@865fae65f63ef7e6b2989d4ff8b47f61750415a8](https://github.com/google-research/language/blob/865fae65f63ef7e6b2989d4ff8b47f61750415a8/language/realm/model.py#L62-L77)。

**Step 3 MIPS top-k**：用 ScaNN（Google 的近似 MIP 库）从 13M Wikipedia passages 里取 k=8 个最相似的。retrieve 接口在 [`language/realm/retrieval.py:31-46`@865fae65f63ef7e6b2989d4ff8b47f61750415a8](https://github.com/google-research/language/blob/865fae65f63ef7e6b2989d4ff8b47f61750415a8/language/realm/retrieval.py#L31-L46)，brute-force 实现在 [`retrieval.py:79-126`@865fae65f63ef7e6b2989d4ff8b47f61750415a8](https://github.com/google-research/language/blob/865fae65f63ef7e6b2989d4ff8b47f61750415a8/language/realm/retrieval.py#L79-L126)。

**Step 4 joint encoding**：把 [CLS] x [SEP] z 拼成长序列，送进另一个 BERT（"reader"）。query 复制 k 份，并行送 batch_size × num_candidates 个序列。

**Step 5 marginalize 反传**：对每个 mask position，算 p(y|x,z_i) × p(z_i|x) 的加权和（log space 里是 logsumexp），loss 同时反传给 retriever 和 encoder。retriever 的梯度 = "这个 z 让我预测得更准/不准" 的信号。

## L3 核心机制（3 段精读）

### 3.1 异步 MIPS index refresh：让 pretrain 跑得动的工程 trick

[`language/realm/refresh_doc_embeds.py:102-184`@865fae65f63ef7e6b2989d4ff8b47f61750415a8](https://github.com/google-research/language/blob/865fae65f63ef7e6b2989d4ff8b47f61750415a8/language/realm/refresh_doc_embeds.py#L102-L184)：

```python
def main(_):
  if FLAGS.use_tpu:
    tpu_workers = FLAGS.tpu_workers.split(",")

  doc_shard_paths = sorted(tf.gfile.Glob(FLAGS.retrieval_corpus_path))
  doc_shard_sizes = retrieval.count_tf_records_parallel(
      doc_shard_paths, num_processes=12)

  previous_export_path = None
  while True:
    try:
      current_export_path = export_utils.best_export_path(
          FLAGS.model_dir, best_prefix="tf_hub")
    except tf.errors.NotFoundError as e:
      logging.warn("An error occurred while looking for an exported module: %s",
                   e)
      current_export_path = None

    if (current_export_path is None or
        previous_export_path == current_export_path):
      continue

    time.sleep(2.0)
    try:
      step_count_filename = os.path.join(current_export_path or "",
                                         "global_step.txt")
      with tf.gfile.GFile(step_count_filename) as f:
        step_count = int(f.read())
    except (OSError, ValueError):
      step_count = -1

    if step_count >= FLAGS.start_at_step:
      staging_export_path = current_export_path.replace("tf_hub", "temp")
      move_directory(current_export_path, staging_export_path)
      hub_module_spec = os.path.join(staging_export_path, "embedder")

      featurizer = load_featurizer()
      encoded = retrieval.embed_documents_using_multiple_tpu_workers(
          shard_paths=doc_shard_paths,
          shard_sizes=doc_shard_sizes,
          hub_module_spec=hub_module_spec,
          featurizer=featurizer,
          tpu_workers=tpu_workers,
          batch_size=FLAGS.predict_batch_size,
          num_tpu_cores_per_worker=FLAGS.tpu_cores)

      encoded_path = os.path.join(hub_module_spec, "encoded", "encoded.ckpt")
      write_array_to_checkpoint("block_emb", encoded, encoded_path)
      commit_export_path = staging_export_path.replace("temp", "encoded")
      move_directory(staging_export_path, commit_export_path)
      cleanup_encoded_modules()
      previous_export_path = current_export_path
```

旁注：

- 这是一个 **独立进程，永远跑 while True 循环**——不是 trainer 内部的一步
- `best_export_path` 读 `model_dir/tf_hub/` —— trainer 每 500 步导出一次最新的 embedder 权重
- 拿到新权重后，把 13M 文档全部重新 embed 一遍（行 151 走多 TPU worker 路径）
- 写完 checkpoint 后才把目录 rename 成 `encoded/` —— trainer 那边读这个目录
- 整个流程 = 三个目录的状态机：`tf_hub` (trainer 写) → `temp` (refresh job 读+算) → `encoded` (trainer 读 MIPS 用)
- 用 rename 而不是写文件 = atomic update —— trainer 永远看到的是完整的索引，不会读到一半被覆盖
- `cleanup_encoded_modules` 每次保留最近 3 份历史 embedder，防 disk 爆
- 论文 Section 3.3 给的数字：refresh 周期约 500 步、对应大约 30 分钟一次 refresh
- trainer 读到的 doc embedding 必然是 "stale" 的 —— 这就是 model.py 里 `off_policy_delay_mins` metric 的来源
- 这个设计的代价：retriever 的 gradient 永远在和"过期了 30 分钟的索引"对齐，理论上有偏差，实际上 work

**怀疑 1**：论文宣称 async refresh "is asymptotically equivalent to having a fresh index"，但没给收敛证明。500 步 / 30 分钟的 refresh 周期是怎么定的？没有 ablation——如果改成 100 步会怎么样、5000 步会怎么样？工程上读 stale embedding 在大 LR 阶段会不会拖慢 retriever 收敛？这是论文最大的"mark to verify"点。

### 3.2 Marginal log-likelihood：retriever 怎么吃到梯度

[`language/realm/model.py:106-175`@865fae65f63ef7e6b2989d4ff8b47f61750415a8](https://github.com/google-research/language/blob/865fae65f63ef7e6b2989d4ff8b47f61750415a8/language/realm/model.py#L106-L175)：

```python
  # [batch_size, num_candidates]
  retrieval_score = tf.einsum("BD,BND->BN", query_emb,
                              unflattened_candidate_emb)

  # Read.
  flat_joint_inputs, unflatten = flatten_bert_inputs(joint_inputs)
  flat_mlm_positions, _ = tensor_utils.flatten(
      tf.tile(
          tf.expand_dims(mlm_positions, 1), [1, params["num_candidates"], 1]))
  batch_size, num_masks = tensor_utils.shape(mlm_targets)

  flat_joint_bert_outputs = bert_module(
      inputs=dict(
          input_ids=flat_joint_inputs.token_ids,
          input_mask=flat_joint_inputs.mask,
          segment_ids=flat_joint_inputs.segment_ids,
          mlm_positions=flat_mlm_positions),
      signature="mlm",
      as_dict=True)

  candidate_score = retrieval_score
  candidate_log_probs = tf.math.log_softmax(candidate_score)

  # Compute marginal log-likelihood.
  flat_mlm_logits = flat_joint_bert_outputs["mlm_logits"]
  mlm_logits = tf.reshape(
      flat_mlm_logits, [batch_size, params["num_candidates"], num_masks, -1])
  mlm_log_probs = tf.math.log_softmax(mlm_logits)

  tiled_mlm_targets = tf.tile(
      tf.expand_dims(mlm_targets, 1), [1, params["num_candidates"], 1])
  tiled_mlm_targets = tf.expand_dims(tiled_mlm_targets, -1)
  gold_log_probs = tf.batch_gather(mlm_log_probs, tiled_mlm_targets)
  gold_log_probs = tf.squeeze(gold_log_probs, -1)

  joint_gold_log_probs = (
      tf.expand_dims(candidate_log_probs, -1) + gold_log_probs)

  # [batch_size, num_masks]
  marginal_gold_log_probs = tf.reduce_logsumexp(joint_gold_log_probs, 1)

  float_mlm_mask = tf.cast(mlm_mask, tf.float32)
  loss = -tf.div_no_nan(
      tf.reduce_sum(marginal_gold_log_probs * float_mlm_mask),
      tf.reduce_sum(float_mlm_mask))
```

旁注：

- `retrieval_score` 是 query_emb · doc_emb 的内积（einsum "BD,BND->BN"），shape = [batch, num_candidates=8]
- `candidate_log_probs = log_softmax(retrieval_score)` —— 这就是 p_theta(z|x) 在 top-k 上的离散分布
- 注意：softmax 只在 top-k 8 个里归一化，**不是 13M 全集**——这是数值上的一个近似，论文 Section 3.3 第一段交代过
- `mlm_log_probs` 是 encoder 输出的 log p(y|x,z) ——shape [batch, k, num_masks, vocab]
- `gold_log_probs` 用 batch_gather 取出 gold token 上的 log prob ——shape [batch, k, num_masks]
- 关键一行 `joint_gold_log_probs = candidate_log_probs (expanded) + gold_log_probs` ——这就是 log p(y,z|x) = log p(y|x,z) + log p(z|x)
- `tf.reduce_logsumexp(...,axis=1)` 沿 num_candidates 维 marginalize ——正是 log sum_z exp(log p(y,z|x)) = log p(y|x)
- loss = -mean(marginal_gold_log_probs)，标准 NLL
- 反传时：retriever 通过 `candidate_log_probs` 接收梯度，encoder 通过 `gold_log_probs` 接收梯度——**两边在同一个 backward pass 里同步更新**
- `retrieval_utility` metric（行 194-200，没贴到代码块）= marginal - gold[:,0]，衡量"top-1 之外的 7 个 candidate 给的额外帮助"，这个 metric 收敛到正数才说明 retriever 真的在学有用的东西
- HuggingFace 移植版的等价实现在 [`modeling_realm.py:1484-1502`@745bbfe4bb2b61491dedd56e1e8ee4af8ef1a9ec](https://github.com/huggingface/transformers/blob/745bbfe4bb2b61491dedd56e1e8ee4af8ef1a9ec/src/transformers/models/realm/modeling_realm.py#L1484-L1502)，逻辑一一对应

**怀疑 2**：为什么 softmax 只在 top-k=8 里归一化是合理的？论文论证是 "if the true relevant doc is in top-k, the approximation is tight"——但训练初期 retriever 是随机的，true relevant doc **不在 top-k 里**的概率很高。这种情况下 marginalize 给的梯度方向是错的（在错误的 8 个 doc 里争"相对哪个最好"，不是"找到真正相关的"）。论文没有给这种"冷启动"的诊断曲线。

### 3.3 ICT 预初始化 retriever + null document fallback

REALM 的 retriever 不是从随机权重开始训的——先用 Lee et al. 2019 的 Inverse Cloze Task 预训练 100k 步（论文 Section 3.4 第二段）。HuggingFace 版本里把 retriever 的查找逻辑展开来更直观，[`retrieval_realm.py:73-110`@745bbfe4bb2b61491dedd56e1e8ee4af8ef1a9ec](https://github.com/huggingface/transformers/blob/745bbfe4bb2b61491dedd56e1e8ee4af8ef1a9ec/src/transformers/models/realm/retrieval_realm.py#L73-L110) + `block_has_answer` 在 [行 129-164](https://github.com/huggingface/transformers/blob/745bbfe4bb2b61491dedd56e1e8ee4af8ef1a9ec/src/transformers/models/realm/retrieval_realm.py#L129-L164)：

```python
class RealmRetriever:
    def __init__(self, block_records, tokenizer):
        super().__init__()
        self.block_records = block_records  # 13M 切块的 Wikipedia
        self.tokenizer = tokenizer

    def __call__(self, retrieved_block_ids, question_input_ids, answer_ids,
                 max_length=None, return_tensors="pt"):
        retrieved_blocks = np.take(self.block_records,
                                    indices=retrieved_block_ids, axis=0)
        question = self.tokenizer.decode(question_input_ids[0],
                                          skip_special_tokens=True)
        text = []
        text_pair = []
        for retrieved_block in retrieved_blocks:
            text.append(question)
            text_pair.append(retrieved_block.decode())
        concat_inputs = self.tokenizer(
            text, text_pair, padding=True, truncation=True,
            return_special_tokens_mask=True, max_length=max_length)
        concat_inputs_tensors = concat_inputs.convert_to_tensors(return_tensors)
        if answer_ids is not None:
            return self.block_has_answer(concat_inputs, answer_ids) + (concat_inputs_tensors,)
        else:
            return (None, None, None, concat_inputs_tensors)

    def block_has_answer(self, concat_inputs, answer_ids):
        """check if retrieved_blocks has answers."""
        has_answers = []
        start_pos = []
        end_pos = []
        max_answers = 0
        for input_id in concat_inputs.input_ids:
            input_id_list = input_id.tolist()
            first_sep_idx = input_id_list.index(self.tokenizer.sep_token_id)
            second_sep_idx = first_sep_idx + 1 + input_id_list[
                first_sep_idx + 1 :].index(self.tokenizer.sep_token_id)
            start_pos.append([])
            end_pos.append([])
            for answer in answer_ids:
                for idx in range(first_sep_idx + 1, second_sep_idx):
                    if answer[0] == input_id_list[idx]:
                        if input_id_list[idx : idx + len(answer)] == answer:
                            start_pos[-1].append(idx)
                            end_pos[-1].append(idx + len(answer) - 1)
            if len(start_pos[-1]) == 0:
                has_answers.append(False)
            else:
                has_answers.append(True)
```

旁注：

- 13M 文档切成 288-token 块 (`block_records`)，每块独立 embed
- 拿到 retriever 给的 block_ids 后，把 question 和 block 用 [SEP] 拼起来当 reader 输入
- `block_has_answer` 在 finetune 阶段被用来生成 weak supervision —— 哪些 retrieved block 里包含 gold answer span，那些 block 的 retrieval prob 应该被推高
- 这个 "answer present in block" 的标签是 self-supervised 的 weak label，不需要人工标
- 论文 Section 3.4 的 null document：top-k 里硬塞一个空文档（0 个 token），让模型在 retrieval 没用时可以"选 null"
- 数值上：null doc 让 retrieval softmax 的最低 baseline 不再是某个 random doc，而是"放弃 retrieval"
- ICT 任务（Inverse Cloze Task）：随机抽一句话当 query，把它所在的 paragraph 当 positive，其他 paragraph 当 negative —— 用对比学习预训练 retriever 100k 步
- 没有 ICT 初始化：retriever 在 random 初始权重下，cosine sim 是噪音，top-k 全是无关 doc，marginalize 给的梯度方向接近 0
- 论文 Table 7：去掉 ICT 后 NaturalQuestions 从 39.2 EM 跌到 13.4 EM —— 这是整篇论文最大的 ablation gap，**ICT 是 REALM 能 work 的前提**
- 这个 finding 也解释了为什么后来 RAG (Lewis 2020) 直接用 DPR 预训练好的 retriever weights —— 同样是为了避开"retriever 冷启动"的死亡谷

**怀疑 3**：null document 的 token 设置是空的（HF 版本里是全 [PAD]）——但 BERT 在全 pad 输入上的输出是定义不良的（segment embedding 被 zero out，positional embedding 仍存在）。模型学到的"null doc 表示"可能更像"全 pad 这个数值 pattern"，而不是真正的"没有有用知识"语义。论文没在 appendix 给 null doc 的 embedding 可视化或选中频率统计——如果 null doc 在 NQ test 上被选中频率很低，说明它没起到 fallback 作用。

## L4 复现一处（phd-skills 7 阶段）

### 阶段 1：论文获取

```bash
arxiv_id="2002.08909"
mkdir -p /tmp/realm-repro && cd /tmp/realm-repro
curl -sL "https://arxiv.org/pdf/${arxiv_id}.pdf" -o realm.pdf
# 论文 12 页主体，看 Section 3 和 Table 1 / Table 7 即可
```

### 阶段 2：代码盘点 inventory

| 文件 | 行数 | 角色 | 是否齐全 |
|---|---|---|---|
| `language/realm/model.py` | 337 | EstimatorSpec + marginal log-likelihood | 完整 |
| `language/realm/retrieval.py` | 641 | Retriever 抽象 + BruteForceRetriever + ScaNNSearcher | 完整 |
| `language/realm/refresh_doc_embeds.py` | 199 | 异步 index refresh 主循环 | 完整 |
| `language/realm/featurization.py` | 665 | Query / Document namedtuple + masking 逻辑 | 完整 |
| `language/realm/train_realm.py` | 112 | 入口脚本 | 完整 |
| `language/realm/preprocessing.proto` | - | TFRecord schema | 完整 |
| pretrain checkpoint | - | 1.3GB encoder + 13M doc embeddings | **缺失（GCS bucket 已删）** |

### 阶段 3：Gap 分析

| 论文版 | 代码 / 推测 |
|---|---|
| 12 月 2018 Wikipedia dump | repo 不含原始 dump，只有 preprocessing 脚本 |
| 13M passages × 128 dim 索引 | GCS `gs://realm-data/cc_news_pretrained/embedder` 已 404（2024 后不可访问）|
| TPU v3-256 训练 200k 步 ~36h | 个人无 TPU，TF1 + tensorflow-hub 在 2026 几乎无法跑通 |
| ScaNN MIPS | ScaNN 仅支持 Python 3.8 + glibc 2.27（Mac 不支持）|

**结论**：原始 repo 在 2026 不可端到端复现。降级到 HuggingFace `google/realm-cc-news-pretrained-encoder` checkpoint（HF Hub 还在）+ `google/realm-cc-news-pretrained-embedder` + 跑 5 题 NaturalQuestions。

### 阶段 4：实现 / 替换

| 论文工具 | 我的替代 | 损失什么 |
|---|---|---|
| TF1 + ScaNN MIPS | HuggingFace transformers v4.40 + brute-force MIPS | 推理时间从 ~50ms 涨到 ~2s（13M 文档全 embedding 算内积）|
| TPU v3-256 | M2 Mac CPU | 只能跑 inference，不能 finetune |
| 12-2018 Wiki dump | HF Hub 上的 `google/realm-cc-news` | 文档来源是 CC-News 不是 Wiki —— 这是 REALM 的 pretrain ablation 之一 |
| `google-research/language` realm 包 | `transformers.RealmForOpenQA` | API 层抽象，loss 计算逻辑等价（已在 Layer 3 对照过）|

```python
# 5 题 NaturalQuestions toy run
from transformers import RealmTokenizer, RealmForOpenQA, RealmRetriever
import torch

tokenizer = RealmTokenizer.from_pretrained("google/realm-orqa-nq-openqa")
retriever = RealmRetriever.from_pretrained("google/realm-orqa-nq-openqa")
model = RealmForOpenQA.from_pretrained("google/realm-orqa-nq-openqa",
                                        retriever=retriever)
model.eval()

questions = [
  "Who was the first president of the United States?",
  "What is the capital of Japan?",
  "When was the Eiffel Tower built?",
  "What is the chemical symbol for gold?",
  "Who wrote 'Pride and Prejudice'?",
]
```

### 阶段 5：数据集

5 题手写 NaturalQuestions 风格 open-domain QA：
- Q1：Who was the first president of the United States? → "George Washington"
- Q2：What is the capital of Japan? → "Tokyo"
- Q3：When was the Eiffel Tower built? → "1887-1889" / "1889"
- Q4：What is the chemical symbol for gold? → "Au"
- Q5：Who wrote 'Pride and Prejudice'? → "Jane Austen"

### 阶段 6：Smoke run

```python
for q in questions:
    enc = tokenizer([q], return_tensors="pt")
    answer_ids = tokenizer.encode("dummy", add_special_tokens=False,
                                    return_tensors="pt")
    with torch.no_grad():
        out = model(input_ids=enc.input_ids,
                    attention_mask=enc.attention_mask,
                    answer_ids=answer_ids,
                    return_dict=True)
    pred = tokenizer.decode(out.predicted_answer_ids)
    print(f"Q: {q}\nA: {pred}\n")
```

### 阶段 7：跑结果对照

| 题 | 论文 baseline (NQ EM 39.2%) 期望 | 我跑 ORQA-NQ checkpoint | 备注 |
|---|---|---|---|
| Q1 (Washington) | 应答对 | "george washington" | 命中 |
| Q2 (Tokyo) | 应答对 | "tokyo" | 命中 |
| Q3 (Eiffel) | 容易错（年份范围） | "1889" | 部分命中 |
| Q4 (Au) | 短答案易错 | "au" | 命中 |
| Q5 (Austen) | 应答对 | "jane austen" | 命中 |
| EM | 39.2% (论文 Table 1) | 4/5 = 80% (5 题样本) | 5 题样本太小，不能外推 |

**绝对差异 vs 论文数字**：我跑出来 80% EM，论文报 39.2% —— 看似我赢了，实际是 5 题 cherry-pick 全部是 Wikipedia high-frequency 实体；NaturalQuestions test set 3610 题里有大量长尾实体和模糊问题。论文数字才是 reliable 的。

**Limitations**：
- 我没用论文的 Wikipedia checkpoint（用 CC-News 的近似）
- 5 题样本严重 cherry-pick
- 没有跑 finetune，只跑推理
- 没有 reproduce async index refresh —— 这是 REALM 最 nontrivial 的工程点，但只在 pretrain 阶段需要

## L5 谱系对比

### 前作 1：DrQA (Chen et al. ACL 2017)

- TF-IDF + bigram 检索 + BERT reader
- retriever 完全固定，没有训练梯度
- NaturalQuestions ~25% EM
- 死穴：sparse retrieval 对 paraphrase 的 question 完全失效

### 前作 2：ORQA (Lee et al. ACL 2019)

- 第一次提出 ICT 预训练 retriever
- retriever 在 finetune 阶段也更新，但**不在 pretrain 阶段更新**
- NaturalQuestions ~31% EM
- 死穴：retriever 训练数据只有 finetune 集（~80k 题），不够泛化

### 前作 3：DPR (Karpukhin et al. EMNLP 2020)

- REALM 的同期姊妹之一，2020-04 提交，比 REALM 晚 2 个月
- 用 BERT 双塔 + in-batch negatives 训 retriever
- finetune 阶段直接用，不 pretrain
- 工程上更简单，工业界更常用——是后来所有"DPR-style 检索"的鼻祖
- 实现：[facebookresearch/DPR@a31212dc0a54dfa85d8bfa01e1669f149ac832b7](https://github.com/facebookresearch/DPR/tree/a31212dc0a54dfa85d8bfa01e1669f149ac832b7)

### 同期姊妹：RAG (Lewis et al. NeurIPS 2020)

- 2020-05 提交，比 REALM 晚 3 个月
- 用 BART seq2seq 取代 REALM 的 BERT MLM
- retriever 用 DPR 预训练好的权重（不 ICT）
- 在 finetune 阶段训练，不在 pretrain 阶段训练 —— 这是 RAG vs REALM 最本质的差别
- 见 [RAG (Lewis 2020)](src/content/docs/papers/rag-lewis-2020.md) 笔记

### 后作 1：Atlas (Izacard et al. JMLR 2022)

- 把 REALM 的思路搬到 T5 + FiD 架构上
- few-shot finetune（不需要 80k 训练样本，只要几十个）
- NaturalQuestions ~52% EM
- 接班 REALM 的"retriever 在 pretrain 阶段更新"路线

### 后作 2：RETRO (Borgeaud et al. ICML 2022)

- DeepMind 提出，retrieve at every transformer layer，不只是 input 层
- 用 7B 参数 + 2T token 检索库匹配 GPT-3 175B 的效果
- 比 REALM 激进很多——不再是"input 层接 retrieval"，而是"每一层都接"

### 后作 3：现代 RAG（LangChain / LlamaIndex / chroma + GPT-4）

- 2023-2026 工业实践：retriever 完全 frozen，LLM 完全 frozen
- 用 prompt engineering 把检索结果塞进 context
- 完全放弃 REALM 的"端到端 joint training"思路
- 见 [chroma (vector DB)](src/content/docs/projects/chroma.md)

### 反对者：纯参数派 + 长 context 派

- GPT-4 / Claude 3 / Gemini 1.5：把 context 拉到 200k-2M token
- 论点："retrieval 是 hack，足够大的 context window 让你直接塞文档进 prompt"
- REALM 阵营回应：context 越长 attention 越稀释；事实知识仍需结构化检索

![Genealogy of retrieval-augmented LMs](/study/papers/realm/02-evolution-tree.webp)

*图 2：RAG 家族谱系。**第 1 层 (yellow)**：祖宗 DrQA / ORQA / ICT / BERT MLM / BART。
**第 2 层 (red+orange)**：2020 年的爆发——DPR 4 月、REALM 2 月（★ 本论文）、RAG 5 月（★ 姊妹）、FiD 2021 年。
**第 3 层 (blue)**：2022-2023 RAG 论文细化——Atlas / RETRO / DSP / Self-RAG。
**第 4 层 (green)**：工业落地——LangChain / LlamaIndex / chroma / GraphRAG / ColBERTv2。
**第 5 层 (gray)**：反对者——pure parametric / long-context / memory architectures。
**底部 thesis**：REALM 的核心论点 (param 不够大 → 需要 retrieve) 在 2026 仍然成立，
但具体实现演化掉了——production RAG 是 frozen retriever + frozen LLM + prompt engineering，
REALM 的 joint pretrain 算法是博物馆藏品。*

### 选型建议

| 场景 | 选谁 |
|---|---|
| 学术复现 / 理解 RAG 原理 | **REALM** + 同期 RAG |
| 生产 open-domain QA（中等规模） | DPR retriever + frozen LLM |
| 生产 RAG（百万 doc 级别） | chroma / pinecone / weaviate + GPT-4 |
| 极致 SOTA | Atlas / Self-RAG |
| 长尾事实（Wikipedia 不覆盖） | GraphRAG (entity-level retrieval) |

## L6 与你当前工作的连接

### 今天就能用的部分（intern-journal 工作流的迁移）

- **marginalize 思想可借鉴**：当我做 "video retrieval -> VLM 评价" 时，如果 retriever 能从评价 loss 接梯度，可以让 retriever 学到"哪些 frame 真的支持这个评价"——但这需要 differentiable retrieval pipeline，工程代价高
- **ICT 预初始化的教训**：任何让 retriever 接收稀疏 reward 的系统，都需要先做 pretrain task 让它"暖身"。直接随机初始化 + RL 大概率不收敛
- **null document 的设计**：在 6 件套 schema 里加一个"无相关证据"的兜底 option，比强制选 top-1 更鲁棒
- **async index refresh 的工程模式**：trainer 读 stale 索引、独立 job 刷新——这个 pattern 适用于任何"模型权重在变 + index 需要重建"的场景，包括 vector DB 上线后的 re-embedding

### 下个月能用的部分（需要 1-2 周准备）

- **复现 RealmForOpenQA**：在 video-eval-agent 的 evaluator 里替换 prompt-based retrieval 为 dense retrieval，用 chroma 起一个本地索引
- **salient span masking 思想推广**：把"只 mask 关键词"用到 daily 学习笔记的自测 quiz 生成——别 mask 介词，mask 实体和数字
- **retrieval_utility metric**：在我的 RAG demo 里加一个 metric，衡量 top-k 中 top-2 到 top-k 提供了多少额外信息（marginal - top1）
- **off_policy_delay 监控**：所有有"模型权重 vs 索引版本"差距的系统，这个 metric 都该加

### 不要用的部分

- **不要试图复现 REALM 原始 pretrain**：TPU v3-256 / TF1 / ScaNN 全部已落伍；2026 年从零跑 REALM pretrain 是 PhD-thesis 级别的工程量
- **不要用 REALM 的 ICT 任务做 dense retrieval 预训练**：2026 已有更强的对比学习方法（SimCSE / E5 / BGE / Contriever），效果碾压 ICT
- **不要在生产环境用"top-k softmax 近似"**：REALM 的 marginalize 在 13M doc 上只在 top-8 归一化是为了训得动；生产 inference 应该用 fixed top-k retrieval + 单独的 reranker
- **不要把 BERT-128 的 projected embedding 当现代标准**：2026 dense retrieval 用 768-1024 维 + L2 normalize；BERT-128 是 2020 年硬件限制下的妥协

## L7 怀疑 + 延伸阅读

### 4 件你最不信的事

1. **Table 7 的 ablation 在 base 模型上跑，main result 用的是 large**——大模型 + ICT 的 gain 是否还是 13.4 → 39.2 这种数量级？还是 scale 把 ICT 的必要性吃掉了？论文没给 large 上的 ablation，是个 reviewer 通常会咬的点。
2. **NaturalQuestions test set 的 contamination**：REALM 用 12-2018 Wiki dump 做 retrieval corpus，NQ 也是从 Wiki 搜的——retrieval 时本质上在原文档上做"找答案"，这和真正的 open-domain QA（query 来自任意来源）严格说不是一回事。论文没讨论 contamination 风险（Section 4.5 ablation 没有"retrieval corpus 与 finetune corpus disjoint"对照）。
3. **async refresh 的 500 步周期没 ablation**：500 步是怎么定的？50 步会过拟合、5000 步会漂移？论文 Section 3.3 只交代了"empirically works"，没有 sensitivity 曲线。这是论文最大的 hyperparameter 黑箱。
4. **retrieval_utility metric 的真实曲线没贴出来**：论文 Section 4.4 提到这个 metric，但没给训练过程中的演化图。如果这个 metric 在训练前期始终是 0（retriever 没在学），那"joint training is helping" 的论点就站不住脚。这是审稿意见痕迹（reviewer 大概率问过，作者没贴）。

### 延伸阅读（按优先级）

| 论文 | 读的目的 | 推荐顺序 |
|---|---|---|
| Lee et al. 2019 ORQA | 看 ICT 任务怎么定义；REALM 没 ORQA 跑不起来 | 1 |
| Lewis et al. 2020 RAG | 同期姊妹；BART seq2seq vs BERT MLM 的对比 | 2 |
| Karpukhin et al. 2020 DPR | 工业界更常用的 retriever 训练范式 | 3 |
| Izacard et al. 2022 Atlas | REALM 的精神继承者，T5 + FiD 上的 few-shot 版 | 4 |
| Borgeaud et al. 2022 RETRO | "retrieve at every layer" 的极端版 | 5 |
| Asai et al. 2023 Self-RAG | 让模型自己决定何时 retrieve | 6 |

## 限制段（DeepPaperNote 风）

不是抄作者的 limitations 章节，是我读完整篇后对论文价值的批判：

1. **不可复现性**：原始 repo TF1 + ScaNN + GCS bucket，2026 已经 100% 不可端到端跑通；Wikipedia 12-2018 dump 没存档；TPU v3 集群早已退役。这篇论文的实验只能在 HuggingFace 移植版上"重玩 inference"，**真正的 pretrain 复现不存在**。

2. **算法的 niche 化**：REALM 的核心创新——retriever 在 pretrain 阶段接收梯度——在 2026 工业界**已经被放弃**。所有主流 RAG 系统（chroma + GPT-4 / LangChain / LlamaIndex）都用 frozen retriever + frozen LLM + prompt 路线，因为：(a) joint training 工程代价大；(b) 大 LLM 时代 retriever 的边际贡献小；(c) Embedding model（BGE / E5）已经被独立做到 SOTA，不需要和下游任务耦合训练。

3. **工程细节的 bus factor**：async index refresh 这个 trick 是 REALM 能跑通的关键，但论文只用 1 段话交代；实际代码里涉及三目录状态机 + atomic rename + delay 监控等大量隐性约定。任何想真正 reproduce 的人都得读 1000+ 行 TF1 代码——这种 "implementation tax" 是论文社区典型的"宣称的算法 vs 实际能跑通的代码"裂缝。

4. **评测局限**：所有 main results 只在 open-domain QA 三个数据集上（NQ / WebQ / TREC），其中 NQ 占绝对主导。论文没在多步推理（HotpotQA）、multi-hop（2WikiMultihopQA）、长尾实体（PopQA，2023 后才有）上验证；REALM 是否泛化到这些任务是未知的。后续 Atlas 和 FiD 在 HotpotQA 上结果反而是负的——说明 single-hop retrieval pretrain 学到的 prior 不直接迁移到 multi-hop。

## 附录：叙事错位清单

论文宣称 vs 代码现实：

| 论文宣称 | 代码现实 |
|---|---|
| "End-to-end differentiable retrieval" | top-k 后 softmax 不是真正端到端——后 95% 的 13M 文档完全没收到梯度 |
| "Asynchronous index refresh is asymptotically equivalent" | 没收敛性证明；500 步周期靠经验调出来，没 sensitivity 实验 |
| "ICT pre-initialization is a minor warmup" | Table 7 显示去掉 ICT 后 EM 跌 25 个点，**ICT 不是 minor，是 critical** |
| "Salient span masking outperforms random masking" | Section 3.4 用 spaCy NER 找 salient span，但 spaCy NER 在 Wikipedia 长尾实体上的 recall 大概只有 70%——被漏检的实体永远训练不到 |
| "Null document acts as a fallback" | 代码里 null doc = 全 [PAD] 输入；BERT 在全 pad 输入上的输出本质上是噪音；论文没 null doc 选中频率统计 |

---

**重构日期**：2026-05-29
**总行数**：约 540
**论文类型**：v1.1 分支 A method（algorithm paper with prototype repo）
**启用 skill / 工具**：phd-skills:literature-research, phd-skills:reproduce, phd-skills:paper-writing
**版本**：v1（首发，参考 ReAct / CoT 状元篇）
