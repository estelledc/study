---
title: jc — 把 100+ Unix 命令的输出一键 JSON 化
来源: https://github.com/kellyjonbrazil/jc
日期: 2026-05-30
分类: CLI
难度: 入门
---

## 是什么

jc 是 Kelly Brazil 在 2019 年用 Python 写的命令行工具。日常类比：

- **传统 shell 管道**：1970 年代约定，命令之间只递交"纯文本"。`ifconfig` 输出的是给人看的对齐表格
- **jc**：站在每个老命令的下游，把这堆"给人看的文本"翻译成"给程序看的 JSON / YAML"

最小例子：

```bash
dig example.com | jc --dig | jq '.[].answer[].data'
```

`dig` 还是 30 年前那个 dig，输出还是那张文字表；`jc --dig` 把它切成结构化 JSON，下游就可以直接交给 [[jq]] 查询。**不改老命令、不改你的脑子，加一节胶水就能进入 JSON 世界。**

## 为什么重要

不理解 jc，下面这些事都没法解释：

- 为什么 Ansible 在 `community.general.jc` 里把 jc 抬成内置 filter——一个 8k 星的小工具，被运维基建吸收
- 为什么"shell 命令 + jq"这一对在 jc 出现前总是缺一块——jq 只懂 JSON，但 50 年的 Unix 命令都不说 JSON
- 为什么 [[gron]] / [[dasel]] / [[fx]] 这些 JSON 工具的 README 里频繁出现 jc——它们是下游，jc 是上游
- 为什么写 100 个小 parser 比写一个"通用文本解析器"更靠谱

## 核心要点

jc 的设计可以拆成 **三个动作**：

1. **接管 stdin**：传统命令把文本吐到管道，jc 是这条管道下一节。`dig ... | jc --dig` 里，jc 只读 stdin，不去重新跑 dig

2. **选 parser**：`--dig` / `--ps` / `--df` / `--lsblk` 各对应一个 Python 模块。每个 parser 独立维护一个 schema（字段名 + 类型），失败也只影响那一条

3. **吐 JSON**：默认 stdout 出标准 JSON；加 `-y` 直接出 YAML；加 `-p` 美化。不交互、不持久化，就是一节"翻译节"

还有一个"魔法模式"——`jc dig example.com`（不写 `|`）。jc 自己 fork+exec dig，再读它的输出。**等价于上面三步压成一行**，少打几个字符。

## 实践案例

### 案例 1：和 [[jq]] 串联——jc 黄金组合

```bash
ps aux | jc --ps | jq 'sort_by(.cpu_percent) | reverse | .[0:5]'
```

`ps aux` 给人看的是宽表，`jc --ps` 切成数组对象，[[jq]] 按 cpu 倒序取前 5。**整条链没人写正则**，每一节都是结构化数据。

### 案例 2：磁盘报警

```bash
df -h | jc --df | jq '.[] | select(.use_percent > 80) | .filesystem'
```

`df -h` 输出包含 `%` 和单位字符串，jc 已经把 `use_percent` 转成数字、size 字段算成字节。下游可以直接做数值比较，不用 `awk -F% '{print $5+0}'` 这种脆弱写法。

### 案例 3：和 [[yq]] 切换格式

```bash
lsblk | jc --lsblk -y
```

`-y` 让 jc 直接吐 YAML——给人看更友好。或者 `jc --lsblk | yq -y .` 让下游 [[yq]] 决定。

### 案例 4：和 [[dasel]] / [[fx]] / [[gron]] 接力

- `ifconfig | jc --ifconfig | dasel -r json '.[0].ipv4_addr'`——[[dasel]] 当查询器
- `jc --route -r | fx`——[[fx]] 在 TUI 里浏览
- `jc --lsof | gron | grep python`——[[gron]] 把嵌套 JSON 拍平给 grep

四把刀各有所长，jc 是它们共同的上游。

### 案例 5：Ansible 集成

```yaml
- shell: dig example.com
  register: dig_out
- set_fact:
    dns: "{{ dig_out.stdout | community.general.jc('dig') }}"
```

playbook 里直接把 jc 当 filter 用，无需自己解析。这是 jc 进入企业基建的标志。

### 案例 6：解析系统文件

`/etc/fstab` / `/etc/passwd` / `/proc/meminfo` 这些非命令但格式固定的系统文件 jc 也吃：

```bash
cat /etc/fstab | jc --fstab | jq '.[] | select(.fs_type=="ext4")'
```

不再用 awk 数列号——一句话拿出所有 ext4 挂载点。

## 踩过的坑

1. **必须显式选 parser**：`cat file | jc` 没有 `--xxx` 不会"自动猜"，会原样转发。100+ 命令各自的输出格式没法靠特征自动识别

2. **macOS / BSD 字段缺**：很多 parser 优先适配 Linux GNU 工具。`ifconfig` 在 macOS 输出格式不同，部分字段会是 null

3. **命令版本漂移**：iproute2 / util-linux 升一版多列一行，jc 没跟上 → 字段错位且**不报错**。生产脚本要锁版本

4. **magic 模式重 fork**：`jc dig example.com` 时 jc 自己启 dig，不继承你 shell 的 alias / 函数。`sudo jc ...` 也容易和 sudo 的 PATH 打架

5. **启动 ~50ms**：纯 Python，循环里调几千次有感。批量场景用 [[jq]] 一次性吃完整个数据，不要每行都启一次 jc

6. **不是流式默认**：大多数 parser 一次性读完 stdin。少量 streaming parser（`--ls-s` / `--ping-s` 等）才能边读边吐

## 适用 vs 不适用场景

**适用**：
- 老 Unix 命令（ifconfig / ps / df / lsblk / dig / route / mount / lsof / netstat / iostat / uptime / uname）+ [[jq]] 查询
- Ansible / shell 脚本里把命令输出结构化成事实
- ad-hoc 运维排查："这台机磁盘 80% 以上的挂载点哪几个"
- 把 dmesg / /etc/fstab / /proc/meminfo 这种系统文件直接喂给 `jc --dmesg` / `jc --fstab` / `jc --proc-meminfo`

**不适用**：
- 命令自带 `--json`（kubectl / docker / aws / gh）→ 用原生输出，jc 多此一举
- 长跑流式日志 → jc 不是 tail+parse，换 [[miller]] 或专门解析器
- 自定义业务日志 → 自写 parser 更可控
- 极致性能（每秒上千次解析）→ 启动开销吃掉全部时间

## 历史小故事（可跳过）

- **2019**：Kelly Brazil 在 GitHub 首发 jc 1.0，最初只覆盖约 30 个命令。立项动机是他在写 Ansible playbook 时，每个 shell module 后都要写一段脆弱的 awk/sed 解析
- **2020**：Ansible 把 `community.general.jc` filter 收进官方集合，jc 一步进入企业自动化生态
- **2021**：突破 100 parser，加 magic 模式（`jc <command>`），减少一次 shell 管道符的输入
- **2023**：开始有 streaming parser 子集（`--ls-s` / `--ping-s` 等），处理长输出不一次性 OOM
- **2024-2026**：持续按月发版，社区 PR 是 parser 数量增长的主力——这是"被基建吸收"后的健康曲线

## 学到什么

1. **小 parser × 100 比通用 parser × 1 更稳**——每个命令格式各不相同，集中维护反而抓不住所有边角。jc 的 100 多个小 Python 文件就是 100 多个"专业户"，单个出错也只塌一个
2. **接生态比造生态省力**——jc 没有发明 JSON、没有发明 jq，只是把"老命令世界"和"JSON 工具世界"接起来。这种"胶水位置"的工具往往生命周期最长
3. **Schema 比覆盖更重要**——parser 的难点不在"切字段"而在"给字段起一致的名字 + 转一致的类型"。这是 8k stars 8 年累积出的协议设计
4. **shell 管道还能再活 30 年**——只要每一节都做好"读取 → 翻译 → 吐出"的本职，老协议永远不会真的死
5. **被基建吸收是开源工具的最高荣誉**——Ansible 把 `jc` 收进官方 filter，jc 就从"小工具"升级为"事实标准"。一旦 playbook 里到处是 `| community.general.jc(...)`，就再也下不来了

## 延伸阅读

- 入门：[jc 官方文档](https://kellyjonbrazil.github.io/jc/)（每个 parser 都有 schema 说明 + 示例）
- 设计：[作者博客 "Bringing the Unix Philosophy to the 21st Century"](https://blog.kellybrazil.com/2019/11/26/bringing-the-unix-philosophy-to-the-21st-century/)
- 社区：[Awesome jq](https://github.com/fiatjaf/awesome-jq) 里的 jc 章节列了大量真实 pipeline
- 替代：cli2json（Go 重写，更快但 parser 少）

## 关联

- [[jq]] —— jc 最常见的下游消费者，"jc | jq" 是 ad-hoc 运维的黄金组合
- [[yq]] —— jc 想直接出 YAML 时用 `-y`；或 `jc | yq` 让 yq 切格式
- [[dasel]] —— 多格式查询器，jc 输出 JSON 后可以替代 jq 做查询
- [[fx]] —— TUI 浏览器，把 jc 输出在终端里翻看更直观
- [[gron]] —— 把 jc 的嵌套 JSON 拍平成行，让 grep / [[ripgrep]] 也能查
- [[ripgrep]] —— gron + ripgrep 处理 jc 输出的"老派"组合
- [[fd]] —— `fd ... -x sh -c '... | jc --xxx | jq ...'` 批量结构化命令输出

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
