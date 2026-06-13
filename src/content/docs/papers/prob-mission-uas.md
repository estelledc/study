---
title: ProMis — 让无人机在不确定的世界里"合法飞行"的神经符号框架
来源: 'Kohaut, Flade, Ochs, Dhami, Eggert, Kersting, "Probabilistic Mission Design for Neuro-Symbolic Unmanned Aircraft Systems", IEEE T-ITS, Vol. 26, No. 12, pp. 22751–22760, 2025'
日期: 2026-06-13
分类: 神经符号
子分类: 混合概率逻辑编程
provenance: pipeline-v3
---

## 是什么

ProMis（Probabilistic Mission Design）是一套让无人机在城市里**安全、合法、可解释地飞行**的神经符号系统架构。论文由 TU Darmstadt、Honda Research Institute Europe、TU Eindhoven 联合发表，发表于 IEEE Transactions on Intelligent Transportation Systems（2025），开源代码在 github.com/HRI-EU/ProMis。

日常类比：你让一个外卖无人机从 A 飞到 B。纯神经网络的做法是给它一张卫星图让它"看着飞"——但它不知道为什么不能飞过医院上空（法律禁止），也不知道地图上那条河到底多宽（地图数据有误差）。ProMis 的做法是：**把法律条文、地图数据、传感器感知全部翻译成同一种"逻辑语言"（概率逻辑），在这个语言里统一推理**——"我 95% 确定当前位置合法，因为这里离禁飞区 200m，地图误差在 10m 以内"。

核心思路三句话：
- **神经（Neural）**：用 Transformer 视觉模型（ChangeFormer）和 LLM 做感知和理解
- **符号（Symbolic）**：用一阶逻辑写法律约束和飞行规则，人能看懂、能审计
- **概率（Probabilistic）**：地图数据和传感器都有误差，用概率分布而不是确定值来表达不确定性

输出是一个**概率任务景观（PML）**——一张概率热力图，告诉你每个位置的合法性概率。深蓝区域是"飞这里肯定合法"，浅蓝区域是"飞这里可能违规"，空白区域是"这里绝对不能飞"。

## 为什么重要

理解 ProMis 对看懂未来城市空中交通（AAM）的 AI 系统至关重要：

- **法律合规是 AAM 的硬门槛**。无人机不是玩具，在人口密集区飞必须合法。纯神经网络的黑盒输出没法给监管方解释"为什么飞这条路"——ProMis 的逻辑规则是可审计的
- **不确定性是常态**。GPS 有误差、地图有偏移、传感器有噪点。大多数导航系统忽视或假设误差为 0——ProMis 把不确定性作为一等公民建模
- **多角色协作**。ProMis 的架构自然地融合了三方输入：公共机构（法律+地图）、运营商（任务目标）、制造商（飞机性能）——每个角色说自己的语言，ProMis 统一翻译成概率逻辑
- **它是神经符号 AI 在安全关键领域的标杆应用**。2024-2025 年神经符号方向论文激增，ProMis 是最早把 LLM + 视觉 Transformer + 概率逻辑全链路打通的系统之一

如果不理解 ProMis，下面这些话题都说不清楚：
- 为什么自动驾驶 / 无人机不能只靠端到端神经网络
- 概率逻辑程序（ProbLog / DeepProbLog）在真实场景里怎么用
- 神经符号系统怎么从实验室论文走到 IEEE 期刊级别

## 核心要点

ProMis 的核心管线分五步，每步都是独立的可替换模块：

### 1. 概率子句模块（PCM）

PCM（Probabilistic Clause Module）负责把"脏数据"翻译成概率分布的参数。输入三类数据：

| 数据类型 | 例子 | PCM 输出 |
|----------|------|----------|
| 事实（Facts） | "医院区域是禁飞区" | 离散子句：`no_fly_zone(x, hospital)` |
| 估计（Estimates） | GPS 位置 (48.137, 11.576, 500) | 连续子句：`altitude ~ Normal(500, 10)` |
| 地理特征（Geographic） | OpenStreetMap 的河岸线 | N 次随机仿射变换后统计均值/方差 |

关键创新在第三个：**地图数据的不确定性建模**。OpenStreetMap 等众包地图的标注有偏差——河流的边界可能偏差 5-15 米。PCM 对每条地理特征的顶点做**随机仿射变换**（旋转+缩放+剪切+平移），生成 N 张"抖动过"的地图样本，然后在这些样本上统计空间关系（如"无人机是否在河流上方"、"距离禁飞区多远"）的均值和方差。

这一步骤等价于说："我不知道那条河的确切位置，所以模拟了 1000 种可能的河岸线——如果 950 种情况你都在河上空，那大概率你确实在河上面。"

### 2. 混合概率逻辑程序（HPLP）

HPLP（Hybrid Probabilistic Logic Programs）是整个系统的核心推理引擎。它扩展了一阶逻辑，同时支持**离散概率**和**连续概率分布**。

离散子句的写法：
```
0.95 :: no_fly_zone(X, hospital) :- over(X, hospital_region).
```
解读：如果无人机 X 在医院区域上方，那么 X 在禁飞区这件事有 95% 概率成立。

连续子句的写法：
```
distance_to(X, river) ~ Normal(mu, sigma) :- over(X, river_region).
```
解读：如果 X 在河流区域上方，到河流的距离服从正态分布 Normal(mu, sigma)，其中 mu 和 sigma 来自 PCM 的统计输出。

HPLP 的关键能力：**把空间关系变成逻辑关系**。`over(X, T)` 是空间判断（无人机是否在类型 T 的地物上方），`distance(X, T)` 是连续量（离地物多远）。这两个谓词是连接感知世界和逻辑世界的桥梁。

### 3. 概率推理（Sum-Product Problem）

HPLP 写好后，ProMis 把它编译成一个**和-积问题（Sum-Product Problem）**：把离散变量求和、连续变量积分，算出每个位置满足所有约束的概率。

对于遍历空间中的每个点 (x, y)，系统问：给定所有已知数据（地图的不确定性、传感器的噪点、法律的硬约束），这个点合法的概率是多少？

因为每个点的推理互相独立（i.i.d. 假设），这一步可以**完全并行**——把空间切成网格，每个格子同时算，GPU 友好。

### 4. 概率任务景观（PML）

推理结果可视化就是 PML（Probabilistic Mission Landscape）：一张二维概率热力图。每个像素是一个独立采样点，颜色深浅代表合法性概率。

PML 不是简单的"能飞/不能飞"二分，而是连续的置信度空间：
- p > 0.95：几乎肯定合法，适合规划航线
- 0.5 < p < 0.95：有不确定性，需要更精确的地图或传感器数据
- p < 0.5：大概率违规，应避开

由于各点独立，PML 天然支持**交互式查询**——你不需要生成整张图，只算你关心的那些点就行。想加一个新约束（"运营商说别飞加油站上空"）也只需要往 HPLP 里加一条规则，重跑推理就行。

### 5. CEO 循环（Clearance, Explanation, Optimization）

论文的扩展工作（"Towards Probabilistic Clearance, Explanation and Optimization", 2024）在 ProMis 上面加了一层 **CEO 循环**：

- **Clearance（放行）**：PML 上做路径规划，检查规划的航线是否全程 p > 阈值
- **Explanation（解释）**：如果某段路径 p 低，系统可以"解释"——因为这里距离学校太近，学校是法律规定的禁飞区上空 100m 范围
- **Optimization（优化）**：多目标优化（航程最短 + 合法性最高 + 风险最低），在 PML 上跑进化算法

整个 CEO 循环用的领域知识也是**声明式编码**的——改一个国家换个法规体系，不需要改代码，改逻辑规则就行。

### 6. LLM 桥接自然语言到逻辑规则

论文还展示了用通用 LLM 把**操作员的自然语言指令翻译成 HPLP 规则**。

操作员说："别飞学校上空 200 米以内，下午 3 点后可以飞河面上，但离医院至少 500 米。"

LLM 翻译成：
```
0.98 :: no_fly_zone(X, school) :- over(X, school_region), distance(X, school) < 200.
0.90 :: allow_river(X) :- over(X, river_region), time > 15:00.
0.98 :: no_fly_zone(X, hospital) :- distance(X, hospital) < 500.
```

这一步的意义：**非技术用户不需要学会写概率逻辑**就能定制无人机的飞行约束。LLM 在这里不是做"思考"，而是做"翻译"——从自然语言到形式语言的翻译。

### 7. ChangeFormer 集成视觉感知

ChangeFormer 是一个基于 Transformer 的变化检测模型。在 ProMis 里，它负责从航拍图像中检测环境变化（新建筑、临时障碍物等），输出直接作为 PCM 的估计数据输入。

为什么是 ChangeFormer 而不是 YOLO 或 Mask R-CNN？因为 ChangeFormer 的核心能力是**对比两张不同时间的图片，找出变化**——对于无人机任务来说，关键感知不是"现在有什么"，而是"和上次飞的时候比，有什么新东西需要绕开"。

## 实践案例

### 案例 1：城市快递无人机的完整飞前检查

假设你运营一家无人机快递公司，需要在慕尼黑市中心飞一趟。流程如下：

**Step 1 — 载入公共数据**：从 OpenStreetMap 拉慕尼黑的地图（道路、建筑、河流、公园）。PCM 对地图做 1000 次随机仿射变换，生成不确定性分布。

**Step 2 — 载入法律规则**：德国无人机法规（LuftVO）编码为 HPLP——
```
0.99 :: no_fly_zone(X, residential) :- over(X, residential_area).
0.99 :: no_fly_zone(X, nature_reserve) :- over(X, nature_reserve).
0.95 :: altitude_limit(X, 100) :- over(X, urban_area).
```

**Step 3 — 操作员输入任务**："从 Hauptbahnhof 送到 Marienplatz，避开所有学校和医院，下午 2 点起飞。"LLM 翻译为额外约束。

**Step 4 — 生成 PML**：GPU 并行推理 1024x1024 网格，产出一张概率热力图。

**Step 5 — 路径规划**：在 PML 上跑 A*，只在 p > 0.95 的区域走，找最短路径。

**Step 6 — CEO 循环**：检查路径是否全程合法 → 如果某段 p < 0.95，解释为什么（"这里离学校 150m，法律要求 200m"）→ 调整航线重试。

整个过程**不依赖单一神经网络的端到端决策**，每一层的输出都是可检查、可审计的。

### 案例 2：地图数据有多"脏"——巴黎测试

论文的配套工作"Hybrid Many-Objective Optimization in Probabilistic Mission Design"在巴黎地图上做了实际测试。

巴黎的 OpenStreetMap 数据里，塞纳河的河岸线标注误差在不同区域不同：市中心误差约 2-5m（高精度），郊区误差约 10-20m（低精度）。如果直接用原始地图做飞前规划，在郊区可能误判"河面上可以飞"——实际飞过去可能撞桥。

PCM 的随机仿射变换策略解决了这个问题：郊区的高方差自动反映在 PML 里——不确定性高的区域，即使"看上去合法"，PML 也会给出中等的概率值（0.6-0.8），提醒规划器谨慎。

### 案例 3：多目标优化——不只找最快的路

无人机快递不是只看速度。实际场景要做多目标权衡：

| 目标 | 权重 | 含义 |
|------|------|------|
| 航程最短 | w1 | 省电、快送达 |
| 合法性最高 | w2 | 别被罚款 |
| 风险最低 | w3 | 避开人多的地方 |
| 噪音最小 | w4 | 别被投诉 |

把四个目标编码成加权和，在 PML 上跑 NSGA-II（多目标进化算法），产出一组 Pareto 最优航线——没有一条在所有维度上都最好，但每条都在某个权重组合下最优。操作员根据当天的优先级挑选。

### 案例 4：换个国家不用改代码

德国 LuftVO 和中国《无人驾驶航空器飞行管理暂行条例》规则不同，但 ProMis 架构下**改的是 HPLP 规则文件，不是代码**。

德国的 PML 生成和中国的 PML 生成走的是同一条推理管线，差别只在于输入的法律子句不同。这对跨国运营的无人机公司来说意义重大——一套系统适配多国法规，合规成本降为"找法律专家写规则文件"而不是"找工程师改代码"。

## 踩过的坑

1. **概率推理的计算开销**。HPLP 推理是 NP-hard 问题。每加一条规则，搜索空间指数增长。论文用 i.i.d. 假设（空间上各点独立）把问题拆成可并行的小块，但对大范围高精度 PML（如 4096x4096 网格），计算时间仍然在分钟级别——实时飞行中没法重算。

2. **地图质量直接影响 PML 质量**。PCM 能建模不确定性，但不能"治愈"数据缺失。如果 OpenStreetMap 完全没有标注某区域的学校，ProMis 不会"猜"那里有学校——它只会给出一个虚假的高合法性概率。不确定性建模的前提是你知道你不知道什么；但数据缺失是不可知的未知（unknown unknowns）。

3. **LLM 翻译自然语言到逻辑规则的可靠性**。论文展示了 LLM 能做这个翻译，但没有系统评估错误率。LLM 可能把"别飞学校上空 200m"翻译成 `distance(X, school) > 200`（意思反了），可能漏掉量词（有哪些学校？），可能误解时间表述。在安全关键场景里，LLM 输出必须有二次验证——论文承认这是开放问题。

4. **静态 PML 对动态障碍物无效**。PML 是你起飞前算好的"世界快照"。飞上去之后遇到临时施工、鸟群、其他无人机怎么办？论文的 ProMis 核心框架不处理动态重规划——那是后续工作要解决的问题。

5. **不同地图来源的坐标对齐**。OpenStreetMap 用 WGS84，地方政府的规划图可能用 UTM 或其他投影。坐标系对齐的误差叠加到 PCM 的不确定性里之后，可能导致 PML 置信度过低（"到处都是灰色区域，哪里都不敢飞"）。

6. **概率阈值设定缺乏标准**。p > 0.95 才算合法？谁定的？为什么不是 0.99 或 0.90？不同的法律场景可能需要不同的置信度标准，论文没有给出系统性的阈值选取方法论。

## 适用 vs 不适用场景

适用：

- 城市无人机快递、巡检、测绘等需要法律合规的飞行任务
- 多角色协作的场景（政府定规则、公司定任务、厂商定硬件）
- 对可解释性有要求的领域（向监管方证明"为什么这条航线安全"）
- 跨法规系统（同一套系统适配多国法规体系）
- 地图数据质量参差不齐的场景（OpenStreetMap 在全球的标注精度差异大）

不适用：

- 实时避障（ProMis 是飞前规划，不是飞行中动态重规划）
- 地图数据严重缺失的区域（garbage in, garbage out）
- 单个无人机玩具级应用（成本过高）
- 不需要法律合规的封闭环境（工厂内部、农业喷洒）
- 对延迟要求极低的任务（PML 重算需要分钟级）

## 历史小故事（可跳过）

- 1995：ProbLog（概率 Prolog）提出——在一阶逻辑里加概率标注，是 HPLP 的祖辈
- 2015：DeepProbLog 把神经网络输出接进 ProbLog，开启"神经+符号"范式
- 2018：Answer Set Programming（ASP）+ 概率 = LP^MLN，另一个概率逻辑路线
- 2020：ChangeFormer 提出——Transformer 做遥感图像变化检测
- 2023：Kohaut 等发表第一篇 ProMis 论文（ITSC 2023），只含 HPLP 核心，还没 LLM
- 2024：CEO 循环论文发布（"Towards Probabilistic Clearance, Explanation and Optimization"）
- 2024 Q4：arXiv 发布 ProMis 完整版（2501.01439），加入 LLM 翻译 + ChangeFormer
- 2025 Q4：正式发表于 IEEE T-ITS Vol. 26(12)，标志神经符号在交通领域的学术认可

## 学到什么

- 安全关键 AI 不能只靠"端到端神经网络飞就完了"——可解释性、可审计性、法律合规是硬需求
- 神经符号系统的核心洞察：**神经网络做感知（看世界），符号逻辑做推理（想世界），概率做不确定性建模（承认不确定）**
- HPLP 的"混合"不只是离散+连续——它把地图数据、传感器、法律条文三种异质信息统一在一个形式语言里
- 不确定性建模不是"附加功能"——在真实地理数据中，地图误差是普遍存在的，不建模就等于假装世界是精确的
- LLM 在安全关键系统里的角色不是决策者，而是"翻译器"——把自然语言转成机器能验证的形式规则
- 模块化架构（PCM → HPLP → PML → CEO）让每个环节可替换、可独立改进——换一个国家只改法律规则文件，换一个传感器只换 PCM
- PML 是神经符号系统的输出范式之一：不是单点输出（"飞这里"），而是概率场输出（"每个位置的可行度"），给下游规划器留决策空间
- 空间关系谓词 `over(X, T)` 和 `distance(X, T)` 是连接感知世界和逻辑世界的"词典"——这两个谓词设计得好坏直接决定系统可用性

## 延伸阅读

- arXiv 2501.01439 — ProMis 完整版论文（本文来源）
- arXiv 2406.03454 — Mission Design for UAVs using HPLP（ITSC 2023，ProMis 前身）
- arXiv 2406.15088 — Towards Probabilistic Clearance, Explanation and Optimization（CEO 循环）
- github.com/HRI-EU/ProMis — 开源代码
- DeepProbLog (Manhaeve et al., 2018) — 神经概率逻辑编程的奠基工作
- ChangeFormer (Bandara & Patel, 2022) — Transformer 变化检测
- Honda Research Institute Europe — ProMis 的工业合作方，关注实际部署

## 关联

- [[hri-eu-probabilistic-mission-design]] — 同一研究组的 HRI-EU 相关工作索引
- [[neuro-symbolic-overview]] — 神经符号 AI 全景综述
- [[probabilistic-logic-programming]] — 概率逻辑编程的完整脉络
- [[advanced-air-mobility]] — AAM 领域的技术图谱
- [[openstreetmap-uncertainty]] — OSM 数据质量与不确定性研究
- [[honda-research-ai]] — 本田研究院的 AI 研究方向

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hri-eu-probabilistic-mission-design]] — HRI-EU Probabilistic Mission Design — Honda Research Institute Europe 的概率任务设计系列
- [[neuro-symbolic-overview]] — 神经符号 AI 综述 — 从 Neuro-Symbolic Concept Learner 到 ProMis
- [[multi-objective-uav-routing]] — 多目标无人机路径规划 — 在 ProMis 生成的 PML 上跑 NSGA-II
- [[constitutional-filter]] — The Constitutional Filter — 同组开发的神经符号贝叶斯滤波器，与 ProMis 共享 HPLP 推理引擎
- [[answer-set-networks]] — Answer Set Networks — 同组开发的 GNN 加速 ASP 求解器，可替代 ProMis 中的概率推理
- [[star-maps-uncertainty]] — StaR Maps — 同组论文，专注地理空间关系的不确定性表示
