---
title: yq — YAML 的 jq（也吃 XML/TOML/properties）
来源: https://github.com/mikefarah/yq
日期: 2026-05-30
分类: CLI
难度: 中级
---

## 是什么

yq 是 Mike Farah 在 2017 年用 Go 写的**命令行 YAML 处理器**，2020 年的 v4 把语法直接抄成 jq 风格——所以它常被叫"YAML 的 jq"。日常类比：

- **jq**：JSON 的瑞士军刀，shell 里挑字段、改字段、聚合统计的标配
- **yq**：把同一套心智模型搬到 YAML 头上——而且顺便吃 XML、TOML、properties、CSV

最小例子：

```bash
yq '.spec.replicas' deploy.yaml         # 读取
yq '.spec.replicas = 3' deploy.yaml     # 改完打到 stdout
yq -i '.spec.replicas = 3' deploy.yaml  # in-place 改回原文件
```

`.spec.replicas` 这种点路径和 [[jq]] 完全同形——会 jq 的人 5 分钟就能上手 yq。

## 为什么重要

yq 在云原生时代几乎是**绕不开**的工具，原因有几层：

- **K8s / Helm / Docker Compose / GitHub Actions / Ansible 的配置几乎全是 YAML**（容器编排、包模板、本地多服务、CI 工作流、自动化剧本）——过去 10 年配置文件被 YAML 绑死，谁都绕不开
- **shell 里改 YAML 没有更轻的默认选项**：sed 改 YAML 容易破坏缩进；Python 写 PyYAML 脚本太重；yq（以及同类 dasel）是"一行管道里改完"的主流做法
- **格式转换是免费送的**：`yq -o=json` 直接 YAML→JSON，`yq -p=xml -o=yaml` 直接 XML→YAML——多格式互转省了 4 个工具
- **单 Go 二进制 + 12k stars + 跟着 K8s 生态一起涨**——装一次就能在 CI、本机、文档示例里反复复用，迁移成本很低

如果说 [[jq]] 是从无到有造了"shell 里处理 JSON"这个场景，那 yq 是把这个场景**横向复制**到了 YAML/XML/TOML——对运维和 CI 来说价值同样大。

## 核心要点

yq 的心智模型可以拆成 **三层**：

1. **路径表达式（和 jq 同形）**：`.spec.containers[0].image` 是路径，`.[]` 展开数组——直接复用 jq 的语法。会 jq 的人零迁移成本。

2. **格式无关引擎**：先把 YAML/XML/TOML/JSON/properties **翻成同一本账本**（内部同一棵树），再用 jq 风格表达式查改。所以 `yq -p=xml` 读 XML、`yq -o=toml` 输出 TOML——同一份过滤器跨格式可用。

3. **保留注释和键顺序（尽量）**：YAML 和 JSON 的关键差异之一是 YAML 有**注释**和**人为键顺序**。yq v4 在大部分场景能保留——这是它能用在生产 PR diff 里的根本原因。

三层叠加，让 yq 既能在 CI 里改 K8s 清单（保留注释 + 顺序），又能临时把 YAML 转 JSON 灌给 jq 再处理。
## 实践案例

### 案例 1：批量改 K8s manifest

```bash
yq -i '.spec.replicas = 5' deployment.yaml
yq -i '.spec.template.spec.containers[0].image = "nginx:1.27"' deployment.yaml
```

`-i` 是 in-place（和 sed 的 `-i` 同义）。这是 yq 在 CI/CD 里最常见的用法——比模板引擎轻、比 sed 安全。

### 案例 2：和 [[jq]] 互补

YAML → JSON 灌给 jq 做更复杂查询：

```bash
yq -o=json deploy.yaml | jq '.spec.template.spec.containers | map(.name)'
```

或者反过来，jq 出 JSON 后 yq 转 YAML 写回：

```bash
kubectl get deploy -o json | jq '.items[0]' | yq -p=json -o=yaml > one.yaml
```

`-p=json` 告诉 yq 输入是 JSON，`-o=yaml` 告诉它输出 YAML。yq 和 jq **不是替代关系，是搭档**。

### 案例 3：和 [[fd]] 配合批量迁移

```bash
fd -e yaml . manifests/ -x yq -i '.metadata.namespace = "prod"' {}
```

[[fd]] 找出所有 YAML，yq 改 namespace。配置文件一次性迁移、环境批量拆分常用。

### 案例 4：和 [[ripgrep]] 配合定位 + 修

```bash
rg -l "image: nginx:1.25" manifests/ | xargs -I{} yq -i '.spec.template.spec.containers[0].image = "nginx:1.27"' {}
```

ripgrep 先找出引用了旧镜像的文件清单，yq 再改。这是"先定位再修改"的标准管道——和 ripgrep + sed 的传统组合同构，只是更适合结构化数据。

### 案例 5：多文档 YAML（K8s 常见）

```bash
yq eval-all '.metadata.name' all-resources.yaml
# 只要第 2 个文档：yq 'select(document_index == 1) | .metadata.name' all-resources.yaml
```

K8s 清单经常是 `---` 分隔的多文档 YAML。**普通 `yq`/`eval` 只看第一个文档**——必须用 `eval-all` 才会跑完所有；要挑某一个文档用 `select(document_index == N)`。混用会静默丢数据。
### 案例 6：格式互转

```bash
yq -p=toml -o=yaml Cargo.toml > cargo.yaml
yq -p=xml -o=json pom.xml | jq '.project.dependencies'
```

把 Maven 的 pom.xml 转 JSON 再用 jq 查依赖——一行管道把 4 种工具的活揉在一起。

## 踩过的坑

1. **同名工具有两个**：Mike Farah 的 Go yq（本笔记，K8s 圈默认）和 Andrey Kislyuk 的 Python yq（jq 的 wrapper，语法不同）。**`yq r file.yaml .a` 是 Python 版，`yq .a file.yaml` 是 Go 版**——StackOverflow 上混着出现，看错就跑不起来。Homebrew `brew install yq` 默认是 Go 版。

2. **v3 和 v4 语法不兼容**：v3 用子命令（`yq w file .a 1`），v4 改成 jq 风格（`yq '.a = 1' file`）——2020 年的大破坏。**老博客 / SO 答案大部分是 v3**，照抄不动。看官方文档先确认版本。

3. **eval vs eval-all**：单文档用 `eval`（默认），多文档（`---` 分隔）用 `eval-all`。混用会**静默丢数据**——只处理第一个文档不会报错。

4. **in-place 偶尔丢注释**：v4 在大部分场景保留注释，但碰到 YAML anchor / alias / 复杂嵌套时会丢一两条。生产环境改完务必 `git diff` 确认。

5. **默认输出 YAML，即使输入是 JSON**：`yq '.foo' x.json` 出来是 YAML 不是 JSON——必须 `-o=json` 才转回去。这点和 jq 习惯反过来。

6. **键顺序**：yq 默认**保留**输入键顺序；但用了 `sort_keys` 或某些操作后会重排，导致 diff 看起来"动了一大片"——CI 审查时容易引战。

## 适用 vs 不适用场景

**适用**：
- **单文件、字段级**改动：K8s / Helm values / Docker Compose / GitHub Actions YAML
- YAML ↔ JSON ↔ TOML ↔ XML 互转（一行管道）
- CI 里 in-place 改几个键（replicas、image、namespace）
- 多格式配置用同一套 jq 风格路径查询
- 从 YAML 提取字段灌给 shell 变量

**不适用**：
- 需要模板逻辑（条件、循环）→ 用 Helm / Kustomize / ytt
- 需要 schema 校验 → 用 kubeconform / ajv / jsonschema
- **跨文件**引用与覆写 → 用 Kustomize patch / overlay（yq 只管单文件管道）
- 需要保留**精确**空白和注释顺序 → yq 重新生成 canonical 形式，不保字符级
## 历史小故事（可跳过）

- **2017**：Mike Farah 发布 yq 1.0，用 Go 写，初衷是"jq 不吃 YAML，那我自己写一个"。
- **2019**：v3 已成 K8s/DevOps 圈事实标准，但语法是子命令式（`yq r/w/d/m`），不像 jq。
- **2020**：v4 大破坏——把语法改成 jq 完全同形（`yq '.a.b = 1'`），同时支持 XML/TOML/properties。社区一片"这次升级好疼但值"。
- **2022-2024**：跟 K8s 一起涨星，进入 Homebrew/apt/brew 默认安装清单，K8s 文档示例直接 `kubectl ... | yq ...`。
- **2025-2026**：12k+ stars，大量 Helm chart / K8s 教程把 yq 写成默认示例工具。

## 学到什么

1. **抄一个成熟工具的语法 = 免费继承用户**——v4 改成 jq 同形后用户成本接近 0，这是它能在 v3→v4 大破坏后还涨星的根本原因。

2. **格式无关引擎是 CLI 工具的护城河**——yq 同时吃 5 种格式但用同一套表达式，这种"一次学习多处复用"是 jq 不具备的差异点。

3. **保留注释 / 顺序是 YAML 工具的生命线**——CI/CD 改完要进 PR diff 给人看，破坏注释会被 reviewer 直接拒。yq 在这点上下了大力气。

4. **同名工具的命名混乱是真实代价**——两个 yq 并存 8 年没合并，新人花在区分上的时间累积起来很可观。开源命名空间是稀缺资源。

## 延伸阅读

- 官方手册：[mikefarah.gitbook.io/yq](https://mikefarah.gitbook.io/yq)（v4 完整语法 + 大量示例）
- 在线 playground：[mikefarah.gitbook.io/yq/v3.x/recipes](https://mikefarah.gitbook.io/yq/recipes)（粘 YAML + 输入表达式）
- 对照表：[v3-to-v4 升级指南](https://mikefarah.gitbook.io/yq/v3.x/upgrading-from-v3)（必看，避坑）
- 同类工具：[dasel](https://github.com/TomWright/dasel)（也是多格式，但生态小一些）

## 关联

- [[jq]] —— 心智模型完全同源；yq 输出 JSON 后常灌给 jq 做更复杂查询
- [[ripgrep]] —— 先 rg 定位含旧值的 YAML，再 yq 批量改
- [[fd]] —— `fd -e yaml -x yq -i ...` 是批量改 manifest 的标准组合
- [[claude-code]] —— Claude Code 在 K8s/CI 场景下的 bash 工具调用常依赖 yq 改 YAML
- [[helm]] —— Helm values 是 YAML；本地改 values 再 `helm template` 常用 yq

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[curlie]] —— curlie — curl 的能力 + HTTPie 的语法
- [[dasel]] —— dasel — 一把刀同时切 JSON / YAML / TOML / XML / CSV
- [[fx]] —— fx — JSON 的交互式查看器（jq 的 TUI 表亲）
- [[gron]] —— gron — 把 JSON 拍平成 grep 能吃的赋值行
- [[httpie]] —— HTTPie — curl 的人话版本
- [[jc]] —— jc — 把 100+ Unix 命令的输出一键 JSON 化
- [[xh]] —— xh — HTTPie 的 Rust 重写版
