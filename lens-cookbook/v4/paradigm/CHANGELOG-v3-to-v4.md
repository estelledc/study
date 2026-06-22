# CHANGELOG v3→v4

## F1 layer 单一性
改：第 5 列 layer，同表全等
触发：v3 vllm-deploy 混 tensor_parallel_size(kernel)+max_num_seqs(serving)
v4：拆 vllm-serving + vllm-kernel

## F2 tuning param=value
改：implementation-tuning decision 正则 `[A-Za-z_]+\s*=\s*\S+` ≥1
触发：v3 "decision: 调大 batch" 口号型
v4：必须 `max_num_batched_tokens=4096`

## F3 4 外迁目录
改：sources/ reading_list/ getting_started/ what_is_not/
触发：v3 glossary 膨胀 800 行
v4：4 文件必存 ≥50 字

## F4 列序锁定
改：候选/ring/立场/触发条件/layer，5 列
触发：v3 列序不一需逐 lens parser

## F5 ADR 段白名单
改：subtype 列必填段，缺即 fail
触发：v3 ≥3 计数被 stub 凑数
v4：tuning 4 段；vendor alts ≥2；architecture 必 rollback
