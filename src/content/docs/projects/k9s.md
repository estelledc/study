---
title: k9s — 让 kubectl 长出眼睛和键盘的终端 UI
来源: https://github.com/derailed/k9s
日期: 2026-05-31
分类: DevOps / Kubernetes
难度: 入门
---

## 是什么

k9s 是一个**跑在终端里的 Kubernetes 仪表盘**——你不再需要反复敲 `kubectl get pod`、`kubectl logs`、`kubectl exec`，而是开一个全屏 TUI（Text UI），用 vim 式按键导航集群资源。

日常类比：

- 用裸 `kubectl` 像**用拨号盘打电话**——每次都要从头拨号、从头记号码（pod 全名）。
- 用 k9s 像**装了通讯录的智能手机**——所有资源列在屏幕上，光标移过去按一个键就进日志、进 shell、看 yaml。

它由 **Fernand Galiana** 在 2018 年开源（Derailed 组织），用 Go 写，底层是 `tview` + `tcell`（终端渲染库）和 `client-go`（K8s 官方 SDK）。GitHub 28k 星，是 Kubernetes 社区事实上的标准 TUI。

## 为什么重要

不熟 k9s 的话，下面这些日常操作都比想象中慢：

- **找一个出问题的 pod**——裸 kubectl 要先 `get pod -A | grep`、再 `describe`、再 `logs`，三条命令；k9s 里 `:pod` → `/关键词` → `l` 三下按键
- **跨 namespace 排查**——k9s 里 `0` 一键看所有 namespace；kubectl 要每条命令带 `-n` 或 `-A`
- **多集群切换**——`:ctx` 弹出列表选一个；裸 kubectl 要 `kubectl config use-context xxx`
- **看资源关系**——一个 Deployment 出错了，下游 ReplicaSet / Pod / Container 都怎么样？k9s 的 **XRay 视图**直接树形展示，kubectl 没有原生等价物

## 核心要点

k9s 的设计可以拆成 **四层抽象**：

1. **命令模式（`:`）切换资源**：按 `:` 进命令模式，输 `pod` / `deploy` / `svc` / `ns` / `ctx` 跳到对应资源列表。和 vim 的 `:` 是一个味道。

2. **资源列表 + 上下文按键**：每种资源屏幕上有一个表格，按 `?` 看当前页能用的所有按键。Pod 视图最常用：`l` 日志、`s` shell、`d` describe、`y` yaml、`e` 编辑、`Shift-F` 端口转发、`Ctrl-D` 删除。

3. **XRay / Pulses 两个特殊视图**：`:xray deploy` 用树形展示 Deployment → ReplicaSet → Pod → Container 的层级；`:pulses` 是集群资源健康仪表盘，一屏看 pod / node / svc 状态分布。

4. **三层可定制**：**skins**（YAML 改颜色）、**hotkeys**（绑自己的快捷键到资源跳转）、**plugins**（绑外部命令到按键，比如选中 pod 按 `Shift-X` 自动调 `kubectl debug`）。

底层用 K8s **informer 模型**——k9s 启动时给 API server 开 watch 长连接，资源变化推送过来，UI 自动刷新，不是轮询。

## 实践案例

### 案例 1：30 秒排查一个 CrashLoopBackOff

```
k9s             # 启动
:pod            # 进 pod 列表
0               # 显示所有 namespace
/crash          # 搜索状态含 crash 的 pod
↓ 选中           # 光标移到目标 pod
l               # 看日志，找到 OOM 报错
Esc s           # 退日志，进 shell 调试
```

整个过程**手不离键盘**，鼠标都不用碰。同样的事用 kubectl 至少 4 条命令、3 次复制粘贴 pod 全名。

### 案例 2：XRay 看 Deployment 全链路

```
:xray deploy
```

屏幕展开成一棵树：

```
└── Deployment/nginx (3/3 ready)
    └── ReplicaSet/nginx-7d4b5
        ├── Pod/nginx-7d4b5-abc12  Running
        ├── Pod/nginx-7d4b5-def34  Running
        └── Pod/nginx-7d4b5-ghi56  CrashLoopBackOff  ← 一眼看到坏的
            └── Container/nginx     Restart: 7
```

光标移到坏 pod 按 `l` 直接看日志。**关系图 + 状态 + 操作**一屏内闭环。

### 案例 3：多集群切换

家里 minikube、公司 EKS、客户 GKE 三个 context，裸 kubectl 切换：

```bash
kubectl config get-contexts        # 列出来
kubectl config use-context eks-prod # 切换
kubectl get ns                      # 验证
```

k9s 里：

```
:ctx
↓↓ Enter
```

两秒内切完。**ctx** 视图还显示当前每个 cluster 的 K8s 版本、节点数，比 kubectl 输出友好。

## 踩过的坑

1. **k9s 显示出的资源 = 你 RBAC 能看的资源**：装到没 cluster-admin 的集群，看到一半 namespace 是空的、按 `:node` 报 forbidden 是正常的——k9s 不会替你越权，它只是 kubectl 的可视层。

2. **`:` 后面打错 alias 会卡住**：k9s 把 `:po` `:pods` `:pod` 都当 pod 视图，但 `:pdb`（PodDisruptionBudget）和 `:pod` 差一个字母，手快了会跳错地方。看屏幕左上角 alias 提示再回车。

3. **大集群启动慢**：k9s 启动会一次性 list 所有资源，1000+ pod 的集群冷启动 5-10 秒正常。可以用 `--namespace=xxx` 限定单 ns，启动秒开。

4. **shell（`s` 键）依赖容器里有 sh/bash**：distroless / scratch 镜像没 shell，按 `s` 直接报错。改用 `kubectl debug` 思路、或在 k9s 里配一个 plugin 调 `kubectl debug` 注入临时 sidecar。

## 适用 vs 不适用场景

**适用**：

- 日常运维 K8s 集群、查日志 / 进 shell / describe 频率高
- 同时管多 cluster 多 namespace，需要快速切换
- 排查 Deployment / Service / Ingress 关系链
- 想给团队新人一个低门槛的 K8s 学习入口（比裸 kubectl 友好）

**不适用**：

- CI / CD 自动化场景——k9s 是交互式 TUI，脚本化用 kubectl 或 client-go
- 集群部署管理——k9s 不替代 [[argocd]] / Helm，它是"看 + 调试"工具不是"部署"工具
- 远程登录受限的环境（只能跑容器、不能开终端）——k9s 必须有 pty
- 习惯 IDE 鼠标操作的人——k9s 是键盘原教旨主义，鼠标几乎没用

## 历史小故事（可跳过）

- **2016 年前后**：Galiana 在工作中天天敲 kubectl 命令、来回切 namespace，受不了，开始动手做一个键盘流的 TUI。
- **2018 年**：开源 k9s 0.1，初版只支持几种核心资源。同时期他还做了 **Popeye**（K8s 集群健康检查工具）。
- **2019 年**：加入 XRay 视图（树形资源关系），社区一下接受度暴涨——这是 kubectl 没有的能力。
- **2020 年**：插件系统 + skin 系统加入，k9s 从"工具"变"平台"。
- **2024 年**：v0.32 重构 watch 层，支持更稳定的 informer 复用，多集群切换体验改进。

Galiana 主要靠 GitHub Sponsors 维持开发，KubeCon 上多次分享 k9s 设计。

## 学到什么

1. **TUI 不是过时形态**——在键盘流程比鼠标快的场景（运维、排查），TUI 比 Web UI 高效一个量级
2. **informer 模型 + watch 长连接** 是 K8s 客户端的标准做法，不是轮询；k9s 是这个模型的好教材
3. **键盘流的设计哲学**：所有操作可达 + 帮助键（`?`）+ 模态切换（`:`）三件套，借鉴自 vim
4. **专注做调试 / 观察工具**——不和 [[argocd]] / Helm 抢部署生态位，定位清晰

## 延伸阅读

- 官方文档：[k9scli.io](https://k9scli.io/)
- GitHub 仓库：[derailed/k9s](https://github.com/derailed/k9s)
- KubeCon talk：搜 "k9s Fernand Galiana" 有多场分享
- 同作者 Popeye：[derailed/popeye](https://github.com/derailed/popeye)（集群健康扫描）
- 视频快速上手：YouTube 搜 "k9s tutorial"，5 分钟视频通常够用

## 关联

- [[kubernetes]] —— k9s 操作的对象，没 K8s 就没 k9s
- [[argocd]] —— Argo CD 管"部署"，k9s 管"运维 + 调试"，互补
- [[helm]] —— Helm 装包，装完用 k9s 看运行状态

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kubectx]] —— kubectx — kubectl 切换 context 和 namespace 的两行命令
- [[lens]] —— Lens — Kubernetes 集群的桌面 IDE
- [[stern]] —— stern — 多 pod 多 container 日志聚合 tail
