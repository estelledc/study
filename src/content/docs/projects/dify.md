---
title: Dify — LLM 应用开发平台
来源: https://github.com/langgenius/dify
日期: 2026-05-29
分类: AI
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/langgenius/dify
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-17'
  immutable_revision: 48e536ba391494052d24d238d92c79056fbec349
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-17'
  review_after: '2026-10-17'
---

## 是什么

Dify 是**上海 LangGenius 团队 2023 年开源的"无代码 / 低代码 LLM 应用平台"**——你不用写一行 Python，只要在浏览器里拖拽节点，就能搭出一个 RAG 问答机器人、一个智能体、或者一条多步 LLM 工作流。

日常类比：

- [[langchain]] / [[llamaindex]] 像**乐高散件**——给程序员一堆 Python 函数，自己拼成想要的形状
- Dify 像**Keynote / Figma**——给产品经理一个画布，拖几个框、连几条线，应用就出来了

举个具体例子：你想给公司做一个"问内部文档的客服机器人"。

- 用 LangChain：装 Python 环境、读文档、写 chain 代码、自己部署 web 服务、自己做账号管理——一个工程师两周
- 用 Dify：浏览器里上传 PDF、新建一个 Chatbot 应用、把 PDF 关联进去、点"发布"——一个 PM 半小时

这不是说 Dify 比 LangChain 好——是它们解决的人不一样。Dify 把"做 LLM 应用"这件事的门槛降到了"会用 Notion 的人就能做"。

## 为什么重要

四个原因：

1. **可视化 LLM 应用平台的代表**——它把模型、RAG、工具、工作流和发布入口放进一个产品，而不是只提供 Python 编排函数。
2. **可自托管，但不自动等于数据不出网**——应用、数据库和向量库可以部署在自己的环境；如果仍调用外部模型、embedding、工具或 marketplace，数据边界还取决于这些上游配置。
3. **多 LLM Provider + 知识库 + 工具市场三合一**——不绑定 OpenAI，可以接 Claude / Gemini / 本地 [[ollama]] / 阿里通义 / 智谱清言。一个产品里，可以同时给国内用户用国产模型、给海外用户用 Claude
4. **Workflow-first**——固定源码中的 `WorkflowEntry` 建立运行上下文，`GraphEngine` 按节点推进；Agent 是一种节点，而不是整个平台唯一的控制流。

## Workflow 架构与流程

Dify 的产品抽象有三层：**应用 → 知识库 → 工作流**。

### App 类型（应用）

四种应用模板，对应不同的产品形态：

- **Chatbot**：纯对话机器人，最简单——给个 prompt + 知识库就能跑
- **Text Generator**：单次输入、单次输出——比如"给我写一首诗"、"翻译这段话"
- **Agent**：智能体——能自己决定调用哪些工具（搜索、计算器、HTTP）来完成任务
- **Workflow**：拖拽 DAG——多个节点串起来，能写复杂逻辑（条件分支、循环、并行）

### Knowledge（知识库）

把 PDF / Word / 网页变成 LLM 可检索的"长期记忆"：

1. 上传文件
2. Dify 自动切片（chunking）——把长文档切成几百字的段落
3. 自动 embedding——每段算出一个向量
4. 入库存到向量数据库（默认 Weaviate，可换 Qdrant / PGVector）

之后在 Chatbot 里关联这个知识库，用户提问时 Dify 会自动检索相关段落塞进 prompt——这就是 RAG（Retrieval-Augmented Generation）。

### Workflow（工作流）

最强大也最复杂的形态。在画布上拖节点，每个节点干一件事：

- **LLM 节点**：调一次大模型
- **知识检索节点**：从知识库查段落
- **条件节点**（IF/ELSE）：根据上一步结果走不同分支
- **HTTP 节点**：调外部 API
- **代码节点**：跑一段 Python / JS（沙箱内）

节点之间用线连起来，数据沿着线流动。整个图就是一条可执行的 LLM pipeline。

## 实践案例

### 案例 1：30 分钟自托管起 Dify

```bash
git clone --depth 1 https://github.com/langgenius/dify.git
cd dify/docker
cp .env.example .env
# 编辑 .env：设置 SECRET_KEY（随机串）+ 服务地址

docker compose up -d
# 拉镜像 + 启动 Postgres / Redis / API / Worker / Web / Plugin Daemon
# 首次约 5-10 分钟

# 浏览器访问 http://localhost/install 创建管理员
# 然后 http://localhost 进控制台
```

完事后控制台里：设置 → 模型供应商 → 添加你的 OpenAI key（或本地 [[ollama]]）。

### 案例 2：3 分钟做一个 RAG 问答机器人

1. 知识库 → 创建 → 上传 PDF（比如公司年报）
2. 选 embedding 模型 → 等切片完成（小文件几秒，大文件几分钟）
3. 工作室 → 创建应用 → 选"聊天助手"
4. 在编辑器里关联刚才的知识库 → 写 prompt（"你是公司助手，根据知识库回答..."）
5. 点"发布"——拿到一个 URL 和一个 API key

把 URL 发给同事，浏览器打开就能用；把 API key 给开发者，可以集成到任何系统里。

### 案例 3：一条 Workflow 多分支

需求：用户问问题，先识别类型，技术问题查技术文档，业务问题查业务文档，最后 LLM 总结答案。

画布上拖：

```
Start → LLM(分类节点)
         ↓
       IF/ELSE
       ├→ 知识检索(技术库) → LLM(总结) ↘
       └→ 知识检索(业务库) → LLM(总结) → End
```

每个节点的输入输出在画布上肉眼可见，调试时点"运行"能看到每一步的中间结果——这是相比纯代码 LangChain 最大的体验提升。

## 踩过的坑

1. **最低配置不等于生产容量**——固定 README 给出的安装门槛是 2 核、4 GiB RAM；真实容量还取决于向量库、并发、文档量和是否本地跑模型，不能从最低值推出生产规格。
2. **Workflow 节点里嵌套引号容易语法错误**——中文 prompt 里写 `"用户的问题是「{{query}}」"`，引号嵌套层数多了 Dify 模板引擎会解析错。技巧：外层用单引号，或者用反斜杠转义，或者把长 prompt 拆成多个节点
3. **自托管仍有外部依赖边界**——模型 provider、embedding、插件市场和自定义 HTTP 工具都可能出网，需要逐项审计，不要只看 Docker 是否运行在内网。
4. **解析吞吐不能靠文件大小猜**——文档解析、切片和 embedding 的瓶颈取决于 parser、队列、provider 和并发配置；先观察任务事件和 worker，再决定是否拆文件。
5. **Workflow 有运行预算**——固定配置包含 `WORKFLOW_MAX_EXECUTION_TIME=1200`。这只是该提交的默认值；升级或部署覆盖后必须重新核对，长任务还要设计 checkpoint 和外部副作用边界。

## 适用 vs 不适用场景

**适用**：

- 10-200 人团队想快速做内部知识库问答、客服助手、表单总结这类标准 LLM 应用
- 产品经理、运营、售前需要自己改 prompt 和流程，但仍希望工程师负责部署和权限
- 企业要求数据尽量留在内网，可以接受 Docker Compose / Kubernetes 自托管
- 需要同时接多个模型供应商，方便按地区、成本或稳定性切换

**不适用**：

- 要写深度自定义推理算法、训练流程或复杂 agent runtime 的团队，直接用代码框架更自由
- 只有一两个固定 API 调用的小功能，引入整个平台反而增加运维成本
- 对毫秒级延迟很敏感的在线链路；Dify 的编排、检索和多节点流程更适合秒级交互
- 没有人维护模型密钥、向量库、队列和插件进程的团队，SaaS 版会比自托管更现实

## 历史小故事

- 固定快照已经包含 `api/`、`web/`、`docker/`、`dify-agent/` 和 `dify-agent-runtime/`，说明它是多进程平台，不是单一 Web 应用。
- provider、tool 和 datasource 能力通过插件体系接入，主 API 通过 plugin daemon 协议访问这些扩展。
- 许可证是“修改版 Apache 2.0”，对多租户服务和前端标识另有条件；不能简写为无附加条件的 Apache 2.0。
- 本文没有启动 Compose、调用模型或执行真实 workflow，运行结论仍保持 `UNVERIFIED`。

## 学到什么

1. **可视化编辑器不是技术难点，编辑器与运行时共享一份 schema 才是**——Dify 真正的工程价值在于"前端拖出来的 JSON 等于后端可执行的 DAG"，而不是 React Flow 本身
2. **Plugin daemon 把扩展故障域移出主 API**——收益是 provider/tool 生命周期更独立，代价是增加服务通信、凭证和版本兼容边界。
3. **许可证必须读附加条件**——修改版 Apache 2.0 对多租户和前端标识有额外约束，部署或再分发前需要按真实用途核对。
4. **"无代码 / 低代码"不是没有代码，是把代码藏在节点里**——Workflow 的代码节点 + HTTP 节点最终还是要写代码，只是把"编排"这件事可视化了。理解这个边界才能选对工具

## 应用型自测

1. Dify 部署在公司内网，但 workflow 调用了外部模型和 HTTP 工具。能否写成“数据完全不出网”？
2. Agent 节点内部会自己选择工具，为什么仍说 Dify 是 workflow-first？
3. 一个 workflow 节点已调用外部付款 API，随后 GraphEngine 超时。只把 workflow 标成失败是否足够？

检查点：

1. 不能。部署位置只覆盖部分边界，还要审计模型、embedding、插件市场和工具调用。
2. Agent 的自主循环仍嵌在图节点内，整体输入输出和下一跳由 workflow 图约束。
3. 不够。外部副作用需要 operation ID、receipt 和不确定状态，不能靠 workflow 最终状态推断是否付款。

## 延伸阅读

- 官方文档：[docs.dify.ai](https://docs.dify.ai)（中英双语，比 README 详细很多）
- 固定源码：[langgenius/dify](https://github.com/langgenius/dify) —— 本文绑定提交 `48e536ba391494052d24d238d92c79056fbec349`
- 视频教程：B 站搜"Dify 实战"——国内创作者很多，30 分钟入门视频质量普遍可以
- 自托管指南：仓库 `docker/README.md` —— 各种部署组合（CPU / GPU / 国内镜像）
- Plugin 开发：[langgenius/dify-plugin-sdks](https://github.com/langgenius/dify-plugin-sdks) —— 想给 Dify 写一个 plugin（接你公司的内部 LLM API）半天上手

## 关联

- [[langchain]] —— Python 库派的代表，给开发者写代码，与 Dify 是不同时代的心智模型
- [[llamaindex]] —— RAG 专项库，与 Dify 的 Knowledge 子系统是"专精 vs 平台"的对比
- [[ollama]] —— 本地跑 LLM 的最简方案，Dify 自托管时常配它做"零成本 + 数据不出门"组合
- [[rag]] —— Dify Knowledge 的核心范式，Retrieval-Augmented Generation
- [[vector-database]] —— Dify 默认 Weaviate，可换 Qdrant / PGVector，是 RAG 的存储层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[botpress]] —— Botpress — 把对话画成流程图加 LLM 节点的开源 chatbot 平台
- [[librechat]] —— LibreChat — 让一份聊天 UI 同时连 OpenAI / Anthropic / Google / 本地模型，对话留在自己的服务器
