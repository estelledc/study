---
title: Lightdash — 寄生在 dbt 项目里的开源 BI
来源: Lightdash Documentation, https://docs.lightdash.com/
日期: 2026-06-01
分类: 数据基础设施
难度: 中级
---

## 是什么

Lightdash 是一个**开源 BI 工具**，它不像 Tableau / Metabase 那样直连数据库自己探查表结构，而是**寄生在 dbt 项目里**——读 dbt 编译产物 `manifest.json`，把 dbt model 的 `schema.yml` 当成自己的语义层定义源。

日常类比：把 dbt 项目想成**已经画好的小区平面图**——每户人家（model）、每个房间（column）都标好了名字、用途、关系。普通 BI 像新搬来的勘测员，自己重新拿尺子量一遍。Lightdash 不量——它读你画好的图，再让你在图纸边上写几行注释（`meta.metrics` / `meta.dimensions`）告诉它哪些字段是"可加总的指标"、哪些是"可切分的维度"，然后它就能直接出图。

写起来是这样：

```yaml
# models/marts/orders.yml
models:
  - name: orders
    meta:
      metrics:
        total_revenue:
          type: sum
          sql: amount
    columns:
      - name: created_at
        meta:
          dimension:
            type: date
            time_intervals: [day, week, month]
```

跑 `dbt parse` 让 dbt 重写 `manifest.json` → Lightdash 拉这份 manifest → 前端就出现 "总收入按月份分组" 的查询界面。

## 为什么重要

不理解 Lightdash 的设计选择，下面这些事就解释不通：

- 为什么 2022 年后冒出一批"BI as Code"工具——Lightdash / Cube / Evidence——核心都在抢"语义层放哪"这个位置
- 为什么 dbt Labs 自己也推出了 Semantic Layer——和 Lightdash 是友商也是合作方，因为它们都认同"metric 应该和数据建模放一起"
- 为什么传统 BI（Tableau / PowerBI）的最大痛点是**指标双轨**：分析师在 dbt 里算了一遍 `total_revenue`，BI 工程师又在 Tableau 里写了一遍公式，两边不一致没人发现
- 为什么 Looker 用自己的 LookML 这条路，新一代工具反而都贴着 dbt 走——dbt 已经是 transformation 事实标准，再造一套 DSL 不划算

## 核心要点

Lightdash 的运转由五个东西咬合：

1. **dbt 项目作为输入**：必须先有 dbt 项目（git 仓库或本地路径）。Lightdash 不做 transformation、不做 ingestion，只读 dbt 已经做完的成果。
2. **`manifest.json` 是契约**：dbt parse / dbt compile 后产出的 JSON，记录所有 model、column、ref 关系。Lightdash 完全靠它，不直接读 `.sql`。
3. **`meta` 字段扩展**：dbt 的 `schema.yml` 原生有 `meta` 自由字段。Lightdash 约定 `meta.metrics` 写指标、`meta.dimensions` 改维度类型。这一约定让 Lightdash 不用改 dbt 就能加语义。
4. **查询编译器**：用户在前端拖拽出"按月看 revenue"，Lightdash 把它翻译成纯 SQL（`SELECT date_trunc('month', created_at), sum(amount) FROM orders GROUP BY 1`）发给 warehouse。
5. **图表 + Dashboard 层**：拿到查询结果后渲染表格 / 折线 / 柱状图，多个图表组成 Dashboard 保存。这一层是普通 BI 都有的，Lightdash 写得简洁但不豪华。

关键洞见：Lightdash **自己不做指标计算、不做 SQL 优化**，所有重活全交给 warehouse。它只负责"翻译"+"展示"。所以快不快几乎只看 warehouse。

## 实践案例

### 案例 1：从零起步的最小项目

已有 dbt 项目跑通后，加一段 YAML：

```yaml
models:
  - name: orders
    meta:
      metrics:
        order_count: { type: count }
        total_revenue: { type: sum, sql: amount }
    columns:
      - name: status
        meta:
          dimension: { type: string }
```

`dbt parse` → 启动 Lightdash → 浏览器里能选 "orders 表 → total_revenue 按 status 分组" → 出柱状图。整个过程**没写一行 SQL**，因为 metric 已经在 YAML 里描述清楚。

### 案例 2：复用 dbt 的 ref 关系做 join

```yaml
models:
  - name: orders
    meta:
      joins:
        - join: customers
          sql_on: ${orders.customer_id} = ${customers.customer_id}
```

**逐部分解释**：

- `meta.joins`：写在 orders model 上，告诉 Lightdash「查 orders 时可以顺带拉 customers」
- `join: customers`：目标 model 名，必须已在同一 dbt 项目里
- `sql_on: ...`：join 条件；`${orders.customer_id}` 是 Lightdash 的字段引用语法，不是裸 SQL 列名

前端拖维度时，customers 表的列也会出现，Lightdash 自动拼 join。这条关系可以和 dbt 的 `relationships` 测试对应——一处描述、双重作用。

### 案例 3：CI 里检查 metric 没坏

```bash
dbt parse                           # 重生成 manifest.json
lightdash compile --project-dir .   # 先编译 dbt，再校验 Lightdash explores / metrics
```

**逐部分解释**：

- `dbt parse`：只更新 manifest，不连仓库跑模型；改完 YAML 后必跑
- `lightdash compile`：CLI 会编译本地项目并检查 metric / join 引用是否断裂
- `--project-dir .`：指向当前 dbt 项目根（有 `dbt_project.yml` 的目录）

PR 改了 model 列名却忘改 metric 的 `sql` 字段时，这里会报错——把 BI 层「运行时才暴露」的问题前移到 CI。

## 踩过的坑

1. **manifest 不刷新就看到旧 metric**：改完 `schema.yml` 必须 `dbt parse` 重写 manifest，Lightdash 不会自动跟着 `.yml` 文件变化——它只信 manifest。
2. **metric type 写错只在 query 时炸**：`type: sum` 但 `sql: status`（字符串列）这种错，dbt parse 不查，跑查询时仓库才报 SQL 错误。补救：在 dbt 加 `not_null` / `accepted_values` 测试守住列类型。
3. **多团队 / 多项目隔离弱**：Lightdash 一个 instance 接一个 dbt 项目最舒服。要服务多个团队，要么开多个 instance、要么靠 dbt 子项目（package）分层。
4. **chart 类型有限**：和 Tableau / Superset 比，Lightdash 的可视化偏简洁，复杂交互（drill-through 多级、像素布局）没有。它定位是"分析师够用"，不是"高管 dashboard 工厂"。
5. **没用 dbt 就用不了**：常被新人误以为"开源 Looker"——其实没有 dbt 项目零功能。这是定位选择而非缺陷。

## 适用 vs 不适用场景

**适用**：

- 已用 dbt 做 transformation，想就地加可视化、不想引入 Looker / Tableau 的团队
- 想让 metric 定义和数据模型同源，避免 dbt 算一遍、BI 算一遍的双轨地狱
- 中小团队 self-host BI，看重 SQL 透明、git 可追踪、开源不锁定

**不适用**：

- 没用 dbt 的团队（用 SQLMesh / 纯 ETL 脚本 / 直接 SQL 仓库）→ 用 Metabase / Superset
- 需要嵌入客户产品做多租户白标 BI → 看 Cube / Embeddable
- 需要像素级布局、丰富交互的高管 dashboard → 看 Tableau / PowerBI

## 历史小故事（可跳过）

- **2020–2021 年**：Oliver Laslett 与联创 Hamzah Chaudhary 看到 dbt 已把 transformation 标准化，但 BI 仍被 Looker/LookML 锁定。他们提出"既然 dbt 已经描述了数据，BI 就不该再造一套 DSL"，开源了 Lightdash。
- **2021–2022 年**：进入 Y Combinator 并完成早期融资，社区从几百 star 涨到几千。同期 Cube、Evidence、Rill 也在抢"现代 BI / 语义层"位置。
- **2023 年**：dbt Labs 自己推出 dbt Semantic Layer（前身 Transform 公司被收购）。Lightdash 既是友商又是合作方——都赌"指标和数据建模该放一起"，只是 Lightdash 用 schema.yml 扩展、dbt SL 用专门的 metric 文件。
- **2024-2025 年**：Modern Data Stack 热度回落，但 dbt + 仓库 + 轻 BI 的三件套依然是中小团队主流。Lightdash 在这个生态里站稳"开源 BI 选项"位置。

## 学到什么

1. **不重新发明轮子比重新发明强**：Lightdash 没造 LookML 那种 DSL，直接寄生 dbt schema.yml。学习成本、维护成本、生态绑定都赢——但代价是绑死 dbt。
2. **抽象层位置决定生死**：dbt 在 transformation 站住后，BI 这一层的"语义"位置就成了新战场。谁定义 metric，谁掌握下游 BI 工具的命脉。
3. **编译 + 委托执行**这套范式在数据栈里反复出现：dbt 编译 SQL 给仓库、Lightdash 编译查询给仓库、Terraform 编译给云 API。源文件不直接生效，先翻译再下发。
4. **承认自己不做的事**：Lightdash 明确说"我不做 transformation、不做 ingestion、不做调度"。这种窄定义反而让它在生态里不和别人抢饭。
5. **开源 + 友商即合作方**：Lightdash 和 dbt SL 在表面竞争，深层一起把"指标该和数据建模同源"这个理念推成行业共识——共同把蛋糕做大比互相抢更划算。

## 延伸阅读

- 官方文档：[Lightdash Docs](https://docs.lightdash.com/)（含 self-host 教程和 metric 语法）
- 源码：[lightdash/lightdash](https://github.com/lightdash/lightdash)（TypeScript 全栈，看 `packages/backend/src/projectAdapters/dbtCloudIde` 理解如何拉 manifest）
- 对照阅读：[dbt Semantic Layer 文档](https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl)（dbt 自家的语义层方案，对比 Lightdash 的差别）
- 创始人访谈：[Oliver Laslett — Why we built Lightdash](https://www.lightdash.com/blog) （讲 LookML 替代品和 self-host BI 选型）

## 关联

- [[dbt-core]] —— Lightdash 的输入；没有 dbt 就没有 Lightdash
- [[metabase]] —— 同代开源 BI 但走相反路线，直连数据库不依赖 dbt
- [[duckdb]] —— 本地 dbt-duckdb + Lightdash 是零成本 BI demo 组合
- [[snowflake]] —— Lightdash 最常见的 warehouse 后端
- [[airflow]] —— 调度 dbt 跑批，dbt 跑完触发 Lightdash 刷新 manifest
