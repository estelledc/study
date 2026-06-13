---
title: RTK — Agent 命令输出压缩
来源: https://github.com/rtk-ai/rtk
日期: 2026-06-13
分类: 其他
子分类: ai-agent-infra
provenance: pipeline-v3
---

## 是什么

RTK（Rust Token Killer）是一个 CLI 代理程序，它在你的 Shell 和 AI Agent（比如 Claude Code、Copilot、Cursor）之间充当一个"翻译官"——拦截你执行的命令，把输出结果压缩之后再交给 Agent 看。

日常类比：你让一个助手去厨房清点食材，助手回来报告时说了一大堆废话："冰箱里有鸡蛋、牛奶、黄油、番茄酱、芥末酱、沙拉酱、番茄、洋葱、大蒜、青椒、红椒、胡萝卜、西兰花……" RTK 就是站在助手门口的第二个人，他把报告改成："冰箱：蛋、奶、黄油、番茄×3、洋葱、蒜、青椒、红椒、胡萝卜、西兰花"——信息一样，但省了 80% 的话。

## 核心概念

### 1. 命令拦截与重写

RTK 最核心的能力是自动改写命令。安装后，你在终端里敲 `git status`，RTK 会在后台把它变成 `rtk git status` 再执行，Agent 收到的就是压缩后的输出。你完全不需要改变自己的使用习惯。

```bash
# 你照常输入
git status

# RTK 在背后改写为
rtk git status

# Agent 收到的是压缩版，而不是原始几百行的 git 输出
```

### 2. 四种压缩策略

RTK 对不同类型的命令使用不同的压缩方法：

- **智能过滤**：去掉注释、空白、样板代码等噪音
- **分组聚合**：把相似的项目合并显示，比如同目录下的文件
- **截断冗余**：保留关键上下文，砍掉重复部分
- **去重计数**：连续重复的日志行合并为一条加计数

### 3. 命令分类处理器

RTK 内置了对 100+ 种命令的支持，每种命令都有专门的处理器。比如 `git status` 只输出变更摘要，`cargo test` 只显示失败的测试，`docker ps` 用紧凑格式列出容器。

## 为什么重要

AI 编程 Agent 的上下文窗口是按 token 计费的。一个普通的 `git status` 可能消耗 3000 tokens，`cargo test` 失败时能到 25000 tokens。RTK 能在不丢失关键信息的前提下，把这些数字压到原来的 10%-40%。

根据官方数据，一个 30 分钟的 Claude Code 会话中，RTK 平均节省约 80% 的 token 消耗：

| 操作 | 标准输出 | RTK 输出 | 节省 |
|------|---------|---------|------|
| `ls` / `tree` | 2,000 tokens | 400 tokens | -80% |
| `cat` / `read` | 40,000 tokens | 12,000 tokens | -70% |
| `cargo test` | 25,000 tokens | 2,500 tokens | -90% |
| `git push` | 1,600 tokens | 120 tokens | -92% |

## 怎么用

### 安装

```bash
# macOS / Linux 推荐方式
brew install rtk

# 或者一键安装
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
```

### 初始化（接入 Claude Code）

```bash
# 安装 hook + 配置文件
rtk init -g

# 重启 Claude Code，之后所有 Bash 命令自动经过 RTK 压缩
```

### 实际效果对比

#### 示例 1：git push 的输出压缩

```bash
# 没有 RTK 时，git push 输出 15 行、约 200 tokens
Enumerating objects: 5, done.
Counting objects: 100% (5/5), done.
Delta compression using up to 8 threads
Compressing objects: 100% (3/3), done.
Writing objects: 100% (3/3), 342 bytes | 342.00 KiB/s, done.
Total 3 (delta 2), reused 0 (delta 0), pack-reused 0
remote: Resolving deltas: 100% (2/2), completed with 2 local objects.
To github.com:user/repo.git
   abc1234..def5678  main -> main

# 有 RTK 后，同样操作只输出 1 行、约 10 tokens
ok main
```

#### 示例 2：cargo test 失败时的输出压缩

```bash
# 没有 RTK 时，测试失败输出 200+ 行
running 15 tests
test utils::test_parse ... ok
test utils::test_format ... ok
test utils::test_validate ... ok
...
test tests::test_edge_case ... FAILED
test tests::test_overflow ... FAILED

failures:

---- tests::test_edge_case stdout ----
thread 'tests::test_edge_case' panicked at 'assertion failed: `(left == right)`
  left: `5`,
 right: `3`', src/tests.rs:42:9

---- tests::test_overflow stdout ----
thread 'tests::test_overflow' panicked at 'called `Result::unwrap()` on an `Err` value: Overflow', src/utils.rs:18:5

failures:
    tests::test_edge_case
    tests::test_overflow

test result: FAILED. 13 passed; 2 failed; 0 ignored; 0 measured

# 有 RTK 后，同样的失败只输出约 20 行
FAILED: 2/15 tests
  test_edge_case: assertion failed
    left: 5, right: 3  at src/tests.rs:42
  test_overflow: panic at utils.rs:18
[full output: ~/.local/share/rtk/tee/1707753600_cargo_test.log]
```

注意最后那一行：如果测试失败了，RTK 会自动保存完整的原始输出到一个临时文件，这样 Agent 需要查看完整错误时可以直接读取，不需要重新运行命令。

### 手动调用

如果某些命令没有被自动重写（比如 Claude Code 内置的 Read、Grep 工具不走 Shell hook），可以手动加上 `rtk` 前缀：

```bash
rtk ls .
rtk read src/main.rs
rtk grep "panic" .
rtk find "*.rs" .
rtk test cargo test
rtk err npm test   # 只看错误行
```

### 查看节省统计

```bash
rtk gain             # 总览节省数据
rtk gain --graph     # 最近 30 天的 ASCII 图表
rtk gain --history   # 最近的命令历史
```

## 支持的 AI 工具

RTK 支持 14 种主流 AI 编程工具，每种有不同的集成方式：

- **Claude Code**：`rtk init -g`（Shell hook 自动改写）
- **Cursor**：`rtk init -g --agent cursor`（preToolUse hook）
- **Gemini CLI**：`rtk init -g --gemini`
- **Codex (OpenAI)**：`rtk init -g --codex`
- **OpenCode**：`rtk init -g --opencode`
- **Cline / Roo Code**：`rtk init --agent cline`

## 注意事项

- RTK 只拦截 Bash 工具调用。Claude Code 的内置工具（Read、Grep、Glob）不走 Shell hook，不会自动改写
- 命令失败时，RTK 默认保存完整输出到 `~/.local/share/rtk/tee/`，不会丢数据
- 隐私方面，遥测功能默认关闭，不需要手动关闭
- Windows 原生环境下 hook 不可用，但可以手动加 `rtk` 前缀使用

## 一句话总结

RTK 在终端和 AI Agent 之间放了一个"压缩器"，你照常敲命令，Agent 少付 token——就像快递里的泡沫填充物，把不该占空间的东西挤掉，留下真正重要的东西。
