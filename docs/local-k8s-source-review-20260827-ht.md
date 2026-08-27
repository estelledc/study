# Local-k8s source review (writer HT)

> 用途：记录 k3s、kind 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：HT
- evidence：GitHub metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行 `install.sh` / `kind create`，未起集群，未测内存、启动耗时或 conformance
- worktrees：本机 `research-worktrees/`，blob-filtered sparse clone，不进入 Git

## k3s

- canonical source：`https://github.com/k3s-io/k3s`
- revision：`5aed4d7beddeb3e67120da477c876ac9efd70318`
- release：轻量 tag `v1.36.3+k3s1` 直接指向该 commit（非 annotated）
- inspected：
  - `README.md`
  - `go.mod`
  - `main.go`
  - `pkg/cli/cmds/root.go`
  - `pkg/cli/cmds/server.go`
  - `pkg/cli/cmds/stage.go`
  - `pkg/cli/server/server.go`
  - `pkg/cluster/cluster.go`
  - `pkg/cluster/managed.go`
  - `pkg/etcd/etcd.go`（`sqliteFile`、`DefaultEndpointConfig`、sqlite→etcd 迁移）
  - `pkg/deploy/stage.go`
  - `pkg/executor/embed/embed.go`（进程入口）
  - `pkg/version/version.go`
- observed：
  - README 写 binary less than 100 MB、sqlite3 为默认存储、Kine 作为 datastore shim；etcd3 / MariaDB / MySQL / Postgres 也可；安装脚本把 kubeconfig 写到 `/etc/rancher/k3s/k3s.yaml`；
  - `go.mod` 为 `go 1.26.5`，`k8s.io/*` replace 到 `v1.36.3-k3s1`；
  - `main` 用 `embed.New` + `executor.Set` 包住 `server` / `agent`；
  - `--cluster-init` usage 为 Initialize a new cluster using embedded Etcd；无该旗标且无 `--datastore-endpoint` 时不 assign 托管 etcd；
  - SQLite 文件为 `${data-dir}/db/state.db`；`DefaultEndpointConfig` 听 Kine unix socket 且 `compact-interval=0s`；
  - `DisableItems` = `coredns, servicelb, traefik, local-storage, metrics-server, runtimes`；
  - `--flannel-backend` 默认 `vxlan`，合法值含 `none` / `host-gw` / `wireguard-native`；
  - `--https-listen-port` 默认 6443；cluster/service CIDR 默认为 `10.42.0.0/16` / `10.43.0.0/16`。
- provenance split：无 npm 发布树。源码 `pkg/version.Version` 编译期注入，工作树里仍是 `"dev"`。

## kind

- canonical source：`https://github.com/kubernetes-sigs/kind`
- revision：`407a9675e6d9af1200b5f57f9ca52ec6cdacce74`
- release：annotated tag `v0.33.0` 剥皮后指向该 commit；tag object `49aeee6b958d818ae881752fe5b09220b39b6f55`
- inspected：
  - `README.md`
  - `go.mod`
  - `pkg/cmd/kind/root.go`
  - `pkg/cmd/kind/version/version.go`
  - `pkg/cmd/kind/create/cluster/createcluster.go`
  - `pkg/cmd/kind/load/docker-image/docker-image.go`
  - `pkg/cluster/constants/constants.go`
  - `pkg/cluster/internal/create/create.go`
  - `pkg/cluster/internal/create/actions/installcni/cni.go`
  - `pkg/cluster/internal/create/actions/installstorage/storage.go`
  - `pkg/apis/config/defaults/image.go`
  - `pkg/apis/config/v1alpha4/types.go`
  - `pkg/apis/config/v1alpha4/default.go`
  - `pkg/internal/runtime/runtime.go`
- observed：
  - `versionCore` 为 `0.33.0`；README 安装示例仍写 `v0.32.0`；
  - 默认节点镜像为 `kindest/node:v1.37.0@sha256:a1ed56cfb0e7b93589bdf97c8cd566405a265939e3620fc4f5de89adff580ae5`；
  - create 流水线：Provision → loadbalancer → kubeadm config → kubeadm init → 可选 default CNI → StorageClass → kubeadm join → wait → export kubeconfig；
  - 默认单 control-plane；IPv4 下 API 听 `127.0.0.1`，Pod/Service CIDR 为 `10.244.0.0/16` / `10.96.0.0/16`，kube-proxy 默认 iptables；
  - 默认 CNI 清单来自节点 `/kind/manifests/default-cni.yaml`；
  - `kind load docker-image` 要求本机已有镜像，经 `docker save` 再 `LoadImageArchive`；
  - `KIND_EXPERIMENTAL_PROVIDER` 可切 podman / docker / nerdctl / finch / nerdctl.lima。
- provenance split：无。CLI 版本与 annotated tag 剥皮提交一致；README 文档版本滞后。
