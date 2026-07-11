---
title: Plane — 开源版 Linear/Jira，把任务、冲刺和协同文档放进自己的机器
description: "介绍 Plane 如何组合任务管理、实时协同和自托管基础设施。"
来源: 'https://github.com/makeplane/plane'
日期: 2026-05-29
分类: 项目管理 / 大型 Web 应用
难度: 中级
---

## 是什么

Plane 是一个开源项目管理平台：你可以在里面建任务、排冲刺、写路线图、做 triage，还能把数据放在自己的 Postgres 里。日常类比：Linear 像一家装修好的共享办公室，Jira 像一整栋需要管理员维护的大楼；Plane 更像把办公室图纸、家具清单和钥匙都给你，让你能自己搭一套。

它不是一个小组件库，而是一套完整产品：React 前端、Django 后端、实时协同服务、Postgres、Redis、对象存储、Docker 部署都在同一个仓库里。读 Plane，重点不是背 API，而是看一个真实 SaaS 如何把“好用界面、复杂业务、自托管”放到同一条生产线上。

## 为什么重要

不理解 Plane，下面这些事都很难解释：

- 为什么很多团队喜欢 Linear 的速度，却仍然想要一个能自托管、可审计、可改源码的替代品
- 为什么大型 Web 应用常把“普通业务请求”和“实时协同 WebSocket”拆成两个运行时
- 为什么 monorepo 不只是把代码放一个文件夹，而是用 turborepo / pnpm workspace 管住构建和共享包
- 为什么开源许可证会影响技术选型：AGPL 对自托管友好，但对闭源二次分发很敏感

## 核心要点

Plane 的核心可以拆成 **三件事**：

1. **任务系统是账本**：Issue / Cycle / Module / State 像会计账本里的“凭证、周期、科目、状态”。Django ORM 和 Postgres 负责让每次新建、归档、排序都有一致结果，而不是前端自己猜。

2. **前端是驾驶舱**：React + MobX 把 issue 列表、看板、筛选、分页拆成多个 store。类比汽车仪表盘：你看到的是速度、油量、导航，但背后每个指针都订阅不同的数据源。

3. **实时协同是对讲机**：Hocuspocus + Yjs + Tiptap 处理富文本多人编辑。它像一台单独的对讲机，不和 Django 的事务账本抢麦克风；两边通过 Postgres / Redis 同步状态。

这三件事合起来，才是 Plane 的工程价值：不是“又一个任务列表”，而是“任务管理 + 协同编辑 + 自托管部署”的组合样板。

## 实践案例

### 案例 1：用 Docker 把完整栈跑起来

```bash
git clone https://github.com/makeplane/plane.git
cd plane/deployments/aio/community
cp .env.example .env
docker compose up -d
```

**逐部分解释**：

- `deployments/aio/community` 是 all-in-one 部署目录，适合第一次体验
- `.env` 里放数据库、Redis、对象存储、站点域名等配置
- `docker compose up -d` 会把 Web、API、Live、Postgres、Redis、MinIO 等服务一起拉起
- 这一步说明 Plane 的定位：不是只给你源码，还要给你一条可跑的自托管路径

### 案例 2：Issue 序号为什么要加锁

```python
with transaction.atomic():
    lock_key = convert_uuid_to_integer(project.id)
    cursor.execute("SELECT pg_advisory_xact_lock(%s)", [lock_key])
    last = IssueSequence.objects.filter(project=project).aggregate(Max("sequence"))
    issue.sequence_id = (last["sequence__max"] or 0) + 1
```

**逐部分解释**：

- `transaction.atomic()` 表示这几步要么一起成功，要么一起回滚
- `pg_advisory_xact_lock` 是 Postgres 的事务级建议锁，只锁当前 project 的序号生成
- `IssueSequence` 单独记录“下一个编号”，避免删除 `#5` 后新任务又变成 `#5`
- 类比医院叫号机：同一个科室必须排队拿号，不同科室可以同时叫号

### 案例 3：实时服务为什么独立出来

```ts
const server = new Hocuspocus({
  onAuthenticate,
  onStateless,
  extensions: [new Logger(), new Database(), new Redis(), new TitleSyncExtension()],
  debounce: 10000,
})
```

**逐部分解释**：

- `onAuthenticate` 负责确认“这个用户能不能编辑这个文档”
- `Database` 把 Yjs 文档保存回数据库，`Redis` 让多个 live 实例互相广播
- `TitleSyncExtension` 把协同编辑里的标题同步回普通 Issue 字段
- `debounce: 10000` 控制持久化频率，不等于“别人看到你打字要等 10 秒”

## 踩过的坑

1. **把 AGPL 当 MIT 用**：自托管自己用通常没问题，但把 Plane 改成闭源 SaaS 对外提供服务会触发强开源义务。

2. **以为 realtime 可以直接塞进 Django**：Python 后端擅长事务和权限，长期 WebSocket 更适合独立 Node 进程，否则连接池和部署节奏会互相拖累。

3. **忘记 `issue_objects` 与普通 manager 的差别**：Plane 的默认可见 issue 会排除 triage、archive、draft；用错查询入口会把“不可见任务”查回来。

4. **复制 1500 行基类模式**：`BaseIssuesStore` 解决了 Plane 的多视图复杂度，但小项目照搬 inheritance 会让状态管理更难维护。

## 适用 vs 不适用场景

**适用**：

- 10 到 500 人团队，想要 Linear 体感，又要把数据留在自己数据库里
- 内网、教育、研发平台等不能直接使用外部 SaaS 的环境
- 想学习大型 TypeScript + Django + Postgres + Redis 产品如何组织 monorepo
- 需要富文本协同，但不想自己实现 CRDT / OT 协议

**不适用**：

- 只想做一个极简待办清单，Plane 的部署和权限模型会过重
- 公司要求闭源二次开发并对外提供服务，AGPL 会让法务风险变高
- 需要 Jira 那种超复杂工作流、审批、资产管理和历史企业集成
- 团队没有 Docker / Postgres / Redis 运维能力，却又不打算使用托管版

## 历史小故事（可跳过）

- **2022 前后**：Plane 以开源项目管理工具的姿态进入视野，主打 Linear / Jira 的开源替代。
- **v0.x 阶段**：产品重点是 issue、cycle、module、workspace 等核心实体，把“能用”先做完整。
- **v1.0 之后**：自托管、协同文档、部署脚本、商业云服务逐步稳定，仓库变成大型 monorepo。
- **v1.3.1**：release 继续修安全和部署细节，包括文件上传、webhook、资产权限等防护，说明项目仍在活跃维护。

## 学到什么

- 大型应用的架构常常不是一个“天才抽象”，而是多套成熟工具之间的边界管理。
- 自托管产品要同时照顾开发体验和运维体验：源码能读，Docker / Helm 也要能跑。
- 实时协同最好当成单独子系统看待：广播、持久化、权限、限流都和普通 REST 请求不同。
- 开源不等于“随便拿来闭源卖”，许可证是架构选择的一部分。

## 延伸阅读

- 项目源码：[makeplane/plane](https://github.com/makeplane/plane)
- 发布记录：[Plane releases](https://github.com/makeplane/plane/releases)
- 协同后端：[Hocuspocus docs](https://tiptap.dev/docs/hocuspocus/introduction)
- [[turborepo]] —— Plane 用 monorepo 工具协调多个 app 和共享包
- [[django]] —— Plane 后端的事务、权限和 API 基础
- [[yjs]] —— Plane 富文本协同背后的 CRDT 数据结构

## 关联

- [[hocuspocus]] —— Plane 的 live 服务用它承接 Yjs WebSocket 协同
- [[mobx]] —— Plane 前端 store 体系依赖 MobX 管理复杂列表状态
- [[postgresql]] —— Issue 序号、事务一致性和持久化都离不开它
- [[redis]] —— realtime 广播、缓存和异步队列都需要 Redis 参与
- [[celery]] —— Plane 后端异步任务的典型 Python 工具
- [[turborepo]] —— 负责把多个应用和共享包纳入同一套构建图

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
