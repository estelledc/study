---
title: gron — 把 JSON 拍平成 grep 能吃的赋值行
来源: https://github.com/tomnomnom/gron
日期: 2026-05-30
分类: CLI
难度: 入门
---

## 是什么

gron 是 Tom Hudson（GitHub 名 tomnomnom）2016 年用 Go 写的**单文件命令行工具**——把任意 JSON 拍平成一行一个的 JavaScript 赋值语句，让 grep / sed / awk / [[ripgrep]] 这些**只懂"行"的老工具**也能处理嵌套 JSON。

日常类比：

- **[[jq]]**：JSON 界的瑞士军刀，但你得**学一门小 DSL**（`.` `|` `select` `map`）
- **gron**：JSON 界的"翻译官"——它不让你学新语言，而是把 JSON **翻译成**你已经会的格式（一行一条赋值），然后你用一辈子用过的 grep 就行

最小例子：

```bash
curl -s https://api.github.com/repos/tomnomnom/gron | gron | grep stargazers
```

看输出长这样：

```
json.stargazers_count = 13892;
```

`json.stargazers_count` 是从 JSON 根节点到目标字段的**完整路径**；`= ...;` 是 JS 风格赋值。每一行**自带完整路径**——所以 grep 一行就够了，不用先想"我要怎么爬到这个字段"。

## 为什么重要

不理解 gron，下面这些事都没法解释：

- 为什么有了 jq 还有人发明 gron——因为**让工具配人**比"让人配工具"省学习成本
- 为什么 14k 星的工具核心代码不到 500 行 Go——它的设计哲学是"做一件事并接好 Unix 管道"
- 为什么 `gron -u`（ungron）能把过滤后的若干行**反拼回合法 JSON**——这是 gron 真正巧妙的地方
- 为什么很多人 debug API 第一反应是 `curl ... | gron | grep`，而不是 `curl ... | jq '...'`——前者**零思考**

## 核心要点

gron 的设计可以拆成 **三个动作**：

1. **拍平（gron）**：把树形 JSON 变成一行一条的 `path = value;`。每行**完整路径 + 完整值**，所以行内自包含——这正是 grep 友好的关键。

2. **过滤（grep / rg / sed）**：用任意行式工具挑出感兴趣的行。这里**不用 gron 自己出力**——它把过滤这件事还给了 Unix。

3. **拼回（gron -u）**：把过滤后的若干行重新拼回合法 JSON。这一步叫 **ungron**，让 gron 不只是"看"工具，也能当"裁剪"工具。

三步加起来就是 gron 的全部。**没有 DSL，没有插件，没有运行时配置**。

## 实践案例

### 案例 1：从 GitHub API 抠两个字段

```bash
curl -s https://api.github.com/repos/tomnomnom/gron \
  | gron \
  | grep -E '\.(stargazers_count|open_issues) ='
```

输出：

```
json.open_issues = 47;
json.stargazers_count = 13892;
```

对照 [[jq]] 写法：`jq '.stargazers_count, .open_issues'`——jq 更短，但你得**记住 jq 语法**。gron 的赌注是：grep 你已经会了。

### 案例 2：先 grep，再用 ungron 拼回 JSON

想从一堆数据里**只保留 stargazers 字段**并**重新输出合法 JSON**：

```bash
curl -s https://api.github.com/repos/tomnomnom/gron \
  | gron \
  | grep stargazers \
  | gron -u
```

输出：

```json
{
  "stargazers_count": 13892,
  "stargazers_url": "https://api.github.com/repos/tomnomnom/gron/stargazers"
}
```

`gron -u` 把"行"重新拼成"树"。**这一步是 [[jq]] / [[yq]] 都没有的形态**——它们不能"先用 grep 裁剪再吐回 JSON"。

### 案例 3：diff 两份 JSON 像 diff 两个文本文件

```bash
diff <(gron a.json) <(gron b.json)
```

因为 gron 输出**每行带完整路径**且**按字母排序**，行级 diff 直接告诉你"`json.users[3].email` 变了"。jq 的 diff 远没这么直观——树形 diff 难看懂。

## 踩过的坑

1. **数组下标用 `[0]` 不是 `.0`**：路径里数组用 `json.results[0].name`，新人常错写 `json.results.0.name`，grep 不到。

2. **输出体积膨胀 3-5 倍**：因为每行都重复完整路径。50KB 的 JSON 拍平后可能 200KB+。流式大文件不要用 gron（它一次性读入）。

3. **ungron 必须吃完整子树**：grep 出 `json.users[0].name` 但漏了 `json.users[0]` 这一行（数组本身的声明），ungron 会拼失败。最稳的做法是 `grep -E 'pattern|^json\.users\[0\] '` 把容器行也带上。

4. **特殊 key 自动加方括号**：`{"a-b": 1}` 拍平成 `json["a-b"] = 1;`。grep 时引号要写对，不然 shell 解析报错。

## 适用 vs 不适用场景

**适用**：

- ad-hoc 看陌生 API 响应——不用先学 schema，gron 一遍 grep 就找到字段
- diff 两份 JSON 配置文件——用普通 `diff` 就行
- shell 脚本里只想抠一两个字段，不想引入 jq 依赖
- 教零基础同学读 JSON——"你看，每一行就是一个完整赋值"，比 jq 直观

**不适用**：

- 复杂转换 / 聚合 / 重组结构——用 [[jq]]
- 流式大文件（>100MB）——gron 一次性读入，会爆内存
- 需要保留原 JSON 字段顺序——ungron 按字母重排
- YAML / XML / TOML——gron 只吃 JSON；YAML 用 [[yq]]

## 历史小故事（可跳过）

- **2016 年**：Tom Hudson（安全研究员，写过 [[ffuf]] 和 assetfinder）在做漏洞赏金时被嵌套 JSON 折磨——既不想学 jq DSL，又想用 grep。他想："那把 JSON 翻译成 grep 能吃的格式不就行了？" 一周后第一版 gron 上线。
- **2018 年**：加上 ungron（`-u`）。这一步把 gron 从"查看工具"升级成"管道工具"——可以**双向**走。
- **2024 年**：14k 星，被 fzf / ripgrep 之流并列推荐为"现代 Unix 命令行套件"成员。Go 单文件，依赖少，brew/apt/pacman 都有。

## 学到什么

1. **让工具配人，比让人配工具省事**——gron 没发明新语法，它把 JSON 翻成"你已经会的格式"
2. **Unix 哲学的现代演绎**：做一件事（拍平），接好管道（grep/sed），可逆（ungron）
3. **设计的价值在于减法**：gron 没 DSL、没配置、没插件，但**因此**它能和任何行式工具组合
4. **同一个问题不一定只有一种工具**：jq、yq、fx、gron 都处理 JSON，但心智模型完全不同——按场景挑

## 延伸阅读

- 主页：[gron GitHub](https://github.com/tomnomnom/gron)（README 5 分钟读完）
- 作者博客：[tomnomnom.com](https://tomnomnom.com/posts/) 看他怎么思考 CLI 工具设计
- [[jq]] —— gron 的"对照组"：DSL 路线 vs 翻译路线
- [[yq]] —— 同心智模型搬到 YAML
- [[fx]] —— 交互式 TUI 路线，又一种 JSON 思路
- [[ripgrep]] —— gron 最佳搭档：`gron file.json | rg pattern`

## 关联

- [[jq]] —— 同处理 JSON，但走 DSL 路线；gron 走"翻译成行 + 复用 grep"路线，互补不替代
- [[yq]] —— 把 jq 心智搬到 YAML；gron 把 JSON 搬到 grep 心智，两个方向不同
- [[fx]] —— 交互 TUI 看 JSON；gron 是非交互管道
- [[ripgrep]] —— gron 拍平后用 rg 比 grep 更快，二者天作之合
- [[ffuf]] —— 同作者 tomnomnom 的另一个工具，体现他"小工具 + 接管道"的一贯设计

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dasel]] —— dasel — 一把刀同时切 JSON / YAML / TOML / XML / CSV
- [[jc]] —— jc — 把 100+ Unix 命令的输出一键 JSON 化
