---
title: dive — 看清 Docker 镜像每一层加了什么文件的 TUI
来源: https://github.com/wagoodman/dive
日期: 2026-05-31
子分类: 命令行工具
分类: CLI
难度: 中级
provenance: pipeline-v3
---

## 是什么

dive 是 wagoodman（Alex Goodman）2018 年用 Go 写的**Docker 镜像分层探索工具**，命令行里跑 `dive 镜像名` 就开一个交互式 TUI，告诉你这个镜像每一层加了/改了/删了哪些文件、浪费了多少空间。

日常类比：

- **docker history**：像看一本书的目录——只告诉你每章多少页，章节标题是什么。
- **dive**：像把书每一页摊开对照——这一页比上一页多了哪些段、改了哪些字、删了哪些行，红的绿的黄的标得清清楚楚。

最直观的场景，你的镜像 1.2G，你怀疑某层装完依赖没清缓存：

```bash
dive my-app:latest
```

左边按 ↑↓ 选层，右边就看到那一层 `/var/cache/apt/` 多了 200MB——根因当场抓住。

## 为什么重要

不理解 dive 这类工具，下面这些事会反复折磨你：

- **镜像越优化越大**：你以为 `RUN apt-get clean` 删掉了缓存，其实只在新层"假装删"了，上一层的 200MB 还在。Docker 镜像是**只能加，不能减**的。
- **CI 报错"镜像超过 1G"**：根因可能是某条 COPY 把 `node_modules` 也带进去了，光看 Dockerfile 看不出来。
- **基础镜像里有密钥**：base image 残留了构建工具、SSH key、编译器，单独看 Dockerfile 永远查不到，dive 一拉就暴露。

dive 的价值是把"镜像 = 一坨黑盒大文件"翻译成"镜像 = 一组可以逐层审计的快照"。

## 核心要点

理解 dive 必须先懂 Docker 镜像怎么存：

1. **镜像 = 多层只读文件系统的叠加**：每条 Dockerfile 指令（RUN / COPY / ADD）通常生成一个新层。运行时联合文件系统（overlay）把所有层堆起来呈现给容器。

2. **删除是"盖住"不是"真删"**：上一层的文件想"删除"，新层会写一个特殊标记叫 **whiteout**（前缀 `.wh.`）。文件还在镜像里，只是被标记成"对容器不可见"。所以 `RUN rm -rf /tmp/cache` 不会让镜像变小。

3. **dive 做的事**：通过 docker daemon 拉到 manifest 和每层的 tar，把每层解包成一棵文件树，然后**层之间做 diff**，得出 added / modified / removed / unchanged，渲染成 TUI。

4. **效率分（efficiency score）**：dive 计算"实际有用的字节 / 镜像总字节"。同一份文件在多层重复出现就是浪费，浪费越多分越低。0.95 以上算健康。

## 实践案例

### 案例 1：抓出"clean 没清干净"

```dockerfile
RUN apt-get update && apt-get install -y curl
RUN apt-get clean && rm -rf /var/lib/apt/lists/*
```

跑 `dive my-img`：第二层显示 `/var/lib/apt/lists/*` 是 removed，但**第一层还有 80MB**。镜像总大小没省。

修法是把两步合并到同一个 RUN：

```dockerfile
RUN apt-get update && apt-get install -y curl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
```

dive 再跑，第一层直接没那 80MB——同层里的删除等价于"没加过"。

### 案例 2：把 dive 塞进 CI

```bash
CI=true dive my-img:latest
```

CI 模式不开 TUI，只输出指标。配合 `.dive-ci` 文件设阈值：

```yaml
rules:
  lowestEfficiency: 0.95
  highestWastedBytes: 20MB
  highestUserWastedPercent: 0.10
```

镜像浪费超过 20MB 直接 exit 1，PR 红灯。

### 案例 3：看 base image 有没有不该有的东西

拉一个第三方 base image：

```bash
dive some/random-base:latest
```

按层翻一遍。如果看到 `/root/.ssh/id_rsa` 或 `/usr/local/go`（编译器）出现在生产 base，立刻换镜像——前者是泄密，后者是攻击面。

## 踩过的坑

1. **大镜像加载慢**：3GB+ 镜像 dive 解包要 1-2 分钟，期间 CPU 满载。先 `docker pull` 让镜像在本地。

2. **效率分是经验公式不是真理**：低于 0.95 不一定有问题，比如多阶段构建本来就有短暂浪费；高于 0.95 也不代表没空间优化。当参考不当结论。

3. **whiteout 不是所有 driver 都一样**：overlay2 和 aufs 的 whiteout 格式不同，旧 Docker 版本 dive 可能解析异常。建议 Docker 20+。

4. **dive build 是包了一层 docker build**：本质是 `docker build` 跑完立刻 `dive` 上去。如果你用 buildkit 高级特性（`--secret` / `--ssh`），还是得直接调 docker build。

## 适用 vs 不适用场景

**适用**：

- 排查"镜像凭啥这么大"
- Dockerfile 优化前后效果对比
- 审计第三方 / 基础镜像内容
- CI 守门（效率分 / 浪费字节阈值）

**不适用**：

- 自动瘦身——dive 只看不改，自动删要用 [DockerSlim](https://github.com/slimtoolkit/slim)
- 漏洞扫描——dive 不查 CVE，要用 [grype](https://github.com/anchore/grype) / trivy
- Windows 容器深度分析——支持有限
- 运行时容器分析——dive 是镜像静态分析，看运行时用 docker stats / cAdvisor

## 历史小故事（可跳过）

- **2018 年**：Alex Goodman 在 Anchore 工作时被 docker history 折磨——只能看每层多大，看不到具体改了什么。周末写了个 Go 版的"按层 diff 文件树"，发到 GitHub。
- **2019 年**：加入 dive build 和 CI 模式，开始被 dev tooling 圈传播。
- **2024 年**：47k stars，成为 Docker 镜像分析的事实标准之一。Anchore 后来出了 syft（SBOM）/ grype（漏洞扫描），三个工具同源同作者团队。

## 学到什么

1. **镜像只能加不能减**——这是 Docker 用户最常踩的坑，dive 让它具象化
2. **whiteout 机制**——"删除"在联合文件系统里是个标记不是物理操作
3. **可观测性的价值**——把黑盒（镜像）翻译成可逐层审计的快照，光这一步就能省下大量瞎猜时间
4. **小工具也能大流行**——dive 整个仓库才几千行 Go，但解决了一个真实痛点，就值 47k stars

## 延伸阅读

- 仓库 README：[wagoodman/dive](https://github.com/wagoodman/dive)（5 分钟看完，配 GIF）
- 配套生态：[anchore/syft](https://github.com/anchore/syft)（生成镜像 SBOM）/ [anchore/grype](https://github.com/anchore/grype)（扫漏洞）
- 反向参考：[slimtoolkit/slim](https://github.com/slimtoolkit/slim)（dive 看到问题，slim 自动改）
- [[ast-grep]] —— 同样是"用更结构化的视角替代 grep / cat"思路
- [[asdf]] —— 同属命令行小工具但解决另一类问题（多版本管理）
- syft / grype（[anchore/syft](https://github.com/anchore/syft) / [anchore/grype](https://github.com/anchore/grype)）—— 同作者团队的 SBOM 与漏洞扫描工具，常和 dive 配合用

## 内部实现速览（读源码线索）

dive 的代码组织清晰，想读源码可以按这个顺序：

1. `dive/image/` —— 镜像加载入口。看 `docker.go` / `podman.go` / `archive.go` 三种来源怎么统一成同一个 `Image` 接口。
2. `dive/filetree/` —— 核心数据结构。`FileTree` 是一棵 trie，节点带 size / hash / 状态（added/modified/removed）。看 `compare.go` 怎么做两棵树的 diff。
3. `runtime/ui/` —— TUI 视图。基于 [tview](https://github.com/rivo/tview) / [tcell](https://github.com/gdamore/tcell)，每个面板（左侧层列表、右侧文件树、底部状态栏）是独立组件。
4. `runtime/ci/` —— CI 模式入口。读 `.dive-ci` yaml，按规则跑 pass/fail。

对零基础读者：先跑通 `go run main.go ubuntu:latest`，再用 delve 在 `LoadImage` 打断点，就能看清整条流水线。

## 关联

- [[ast-grep]] —— 都把"按字面看"升级成"按结构看"
- [[asdf]] —— 同样是命令行小工具圈但解决另一类问题
