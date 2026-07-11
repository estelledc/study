---
title: Dify — LLM 应用开发平台
来源: https://github.com/langgenius/dify
日期: 2026-05-29
分类: AI
难度: 中级
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

1. **国内 LLM 应用平台的开源代表**——和ByteDance扣子、阿里魔搭智能体、百度文心智能体形成同一条赛道。这条赛道的特征是"PaaS 给非程序员"，背后假设是"未来用 LLM 的人 ≫ 写 LLM 代码的人"
2. **Apache 2.0 + 自托管**——不像扣子 / Bedrock 那样只能用云，Dify 可以 docker compose up 起在自己机器上，数据完全不出门。这对企业内部知识库特别重要——很多公司不允许把 PDF 传到第三方
3. **多 LLM Provider + 知识库 + 工具市场三合一**——不绑定 OpenAI，可以接 Claude / Gemini / 本地 [[ollama]] / 阿里通义 / 智谱清言。一个产品里，可以同时给国内用户用国产模型、给海外用户用 Claude
4. **GitHub 70k+ stars**——开源 LLMOps 平台头部。社区活跃意味着遇到问题大概率有人踩过，文档相对完善

## 核心要点

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

1. **自托管 docker-compose 至少 8GB 内存**——4GB 机器上 Postgres + Redis + Worker + Web + Plugin Daemon 起不全。生产环境建议 16GB 起，知识库大的话 32GB
2. **Workflow 节点里嵌套引号容易语法错误**——中文 prompt 里写 `"用户的问题是「{{query}}」"`，引号嵌套层数多了 Dify 模板引擎会解析错。技巧：外层用单引号，或者用反斜杠转义，或者把长 prompt 拆成多个节点
3. **token 计费要在 Provider 设置里手动配**——Dify 不会自动从 OpenAI 账单同步费用。要看每个 tenant 用了多少钱，得在"模型供应商"页手动填每千 token 单价。算法是"调用次数 × 单价"，和 OpenAI 实际账单可能有偏差
4. **Knowledge 大文件 embedding 很慢**——100MB+ 的 PDF 切片 + embedding 可能要跑 30 分钟以上，因为是单线程顺序处理。技巧：大文件先在外部用 PyPDF2 拆成多个小 PDF 再上传，能并行 embedding
5. **Workflow 单次执行有时长上限**——默认 `WORKFLOW_MAX_EXECUTION_TIME=1200s`（20 分钟），超过被强制中断。长跑任务（视频处理、跨多步深度推理）要拆成多个 workflow 串联，或者在外部用 Celery 调度

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

- **2023-04**：LangGenius 在上海注册成立，团队来自ByteDance和摩拜的背景，第一天就决定全公开开发
- **2023-05**：第一版 Dify 开源到 GitHub——当时还叫 "LangGenius"，后来才改成 "Dify"。最初只有 Chatbot 一种应用类型
- **2024-初**：v0.5 加入 Agent 模式（react 循环 + function calling）
- **2024-中**：v0.6 加入 Workflow——可视化 DAG 编辑器登场，这是 Dify 真正出圈的版本
- **2024-Q4**：Dify Cloud 商业化上线——SaaS 版，按 message / 知识库容量计费；同时推出企业版，支持私有化部署 + 商业 license
- **2025**：v1.0 GA，重构成 Plugin Daemon 架构——把所有 LLM provider 抽到独立 daemon 进程，主进程零 LLM SDK 依赖

两年从开源到 70k stars，是国内开源 SaaS 项目跑得最快的之一。

## 学到什么

1. **可视化编辑器不是技术难点，编辑器与运行时共享一份 schema 才是**——Dify 真正的工程价值在于"前端拖出来的 JSON 等于后端可执行的 DAG"，而不是 React Flow 本身
2. **Plugin daemon 模式比 import SDK 更优**——主进程对所有 LLM provider 零依赖，加新 provider 不需要改主仓代码、不需要重启服务。这个模式可以拷贝到任何"多上游"的中间件设计
3. **Apache 2.0 + brand 限制是中国开源项目商业化的常见路径**——既不像 BSL 那样劝退社区，也不像纯 Apache 那样被白嫖，留出 SaaS 商业化空间
4. **"无代码 / 低代码"不是没有代码，是把代码藏在节点里**——Workflow 的代码节点 + HTTP 节点最终还是要写代码，只是把"编排"这件事可视化了。理解这个边界才能选对工具

## 延伸阅读

- 官方文档：[docs.dify.ai](https://docs.dify.ai)（中英双语，比 README 详细很多）
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
