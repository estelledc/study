---
title: 'InvokeAI — 工业级 Stable Diffusion 工具'
来源: 'https://github.com/invoke-ai/InvokeAI'
日期: '2026-05-31'
分类: '数据科学与 AI'
难度: '中级'
---

## 是什么

InvokeAI 是一个**把 Stable Diffusion 当成服务端产品来做的开源工具**：FastAPI 后端 + React 前端 + SQLite 数据库 + 任务队列，画布、节点编辑器、模型管理三块能力做在一个壳里。日常类比：A1111 webui 像家用照片打印机（插上就能出图，扩展靠粘贴），ComfyUI 像 Eurorack 模块化合成器（自己接线最自由），**InvokeAI 像一台带订单系统的数码冲印店**——前台、车间、相册柜、打印队列分得清清楚楚，能开门做生意。

最小启动方式：

```bash
pip install InvokeAI
invokeai-web
```

浏览器开 `127.0.0.1:9090`，看到的是一个有左侧画布、右侧节点编辑器、顶部模型管理的完整应用——不是 A1111 那种『一个 Gradio 长页』。

## 为什么重要

不理解 InvokeAI，下面这些事讲不清：

- 为什么同样跑 Stable Diffusion，InvokeAI 能给你**真任务队列 + 取消按钮**，而 A1111 你点了 Generate 就只能等
- 为什么 InvokeAI 的 workflow JSON 可以**直接 POST 给后端跑**而不需要 UI——节点图就是 OpenAPI schema 的客户端
- 为什么想把 SD 嵌进自己产品里，InvokeAI 的 REST API 比 A1111 / ComfyUI 都好对接——它从一开始就是按服务端思维造的
- 为什么相对 A1111 / ComfyUI / Forge / sd.next 这几家常见对照，InvokeAI **认真做了 alembic 数据库迁移**——其他几家多半还是文件 + JSON 凑

## 核心要点

记 **3 个抽象 + 1 个边界**：

1. **Invocation = 一个 Pydantic 类**：每个『节点』本质是继承 `BaseInvocation` 的 Python 类，输入输出靠 Pydantic 字段声明。Pydantic 不只是校验，它**自动生成 OpenAPI schema**——前端的 TypeScript client 是用 openapi-typescript 直接编译出来的，不是手写。

2. **Graph Executor + Session Queue**：节点不是 ComfyUI 那种『拓扑排序立刻跑』，而是先组成 graph，进入 session queue（SQLite 里的一张表），后台 worker 取出来跑。带来三件 A1111 没有的能力——**取消、批处理、断电恢复**。

3. **Boards = 数据库里的相册**：生成的图不是按文件名规则塞 `outputs/`，而是写进 `images` 表 + 关联 `boards` 表。元数据（prompt / seed / 用了哪个 LoRA）存 JSON 列。Civitai 风格的目录约定在这里被替换成关系模型。

4. **三种 UI 共享同一个后端**：Linear（小白模式）、Unified Canvas（图层/蒙版/inpaint）、Workflow Editor（节点图）——本质都是不同前端形式的『往 session queue 塞 graph』。新人最容易困惑的边界就是这三种 UI 互通，你在 Canvas 涂的蒙版能在 Workflow 里被引用。

## 实践案例

### 案例 1：写一个最小的 Invocation（理解节点的本质）

```python
from invokeai.app.invocations.baseinvocation import (
    BaseInvocation,
    BaseInvocationOutput,
    invocation,
    invocation_output,
)
from invokeai.app.invocations.fields import InputField, OutputField

@invocation_output("integer_output")
class IntegerOutput(BaseInvocationOutput):
    value: int = OutputField(description="两数之和")

@invocation("add_two", title="Add Two", tags=["math"], version="1.0.0")
class AddTwoInvocation(BaseInvocation):
    a: int = InputField(default=0, description="第一个加数")
    b: int = InputField(default=0, description="第二个加数")

    def invoke(self, context) -> IntegerOutput:
        return IntegerOutput(value=self.a + self.b)
```

**逐部分解释**：

- `@invocation_output` 先声明输出类型，前端才能知道这个节点会吐出什么字段
- `@invocation(...)` 把类注册成节点；`title` 会出现在节点编辑器里
- `InputField` / `OutputField` 既做校验，也进 OpenAPI schema
- 放进自定义 `nodes/` 后重启，编辑器会出现 `Add Two`——这是 A1111 monkey-patch 扩展给不出的体验

### 案例 2：Unified Canvas 的 inpaint 在底层做了什么

你在画布上涂蒙版、点 Generate，前端实际做的是：

1. 从 Konva 画布读出当前图层 → PNG bytes
2. 读蒙版图层 → PNG bytes（白色 = 要重画的区域）
3. 调 `POST /api/v1/queue/.../enqueue_batch` 提交一个 graph：`Image → Mask → Denoise (with mask) → Decode`
4. 后端把这个 graph 写进 SQLite，worker 拉走开跑
5. 前端订阅 SSE 流（`/api/v1/queue/.../events`），实时收 progress
6. 完成后图片入 boards 表，前端拉回画布替换图层

整个过程**没有 Gradio**——是一个普通 React SPA + REST + SSE。这个架构让 InvokeAI 能做出 A1111 做不出的东西：多人共享一个队列、一台 GPU 服务多个画布、把后端单独部署。

### 案例 3：Workflow JSON 直接当 API 用

InvokeAI 的 graph 是**严格 JSON**，不是 ComfyUI 那种界面状态混节点配置。最小可提交骨架：

```json
{
  "batch": {
    "graph": {
      "id": "demo-add",
      "nodes": {
        "a": {"id": "a", "type": "add_two", "a": 1, "b": 2}
      },
      "edges": []
    }
  }
}
```

**逐部分解释**：

- `nodes` 里每个条目的 `type` 对应 Invocation 注册名（上面的 `add_two`）
- `edges` 描述端口连线；单节点图可以为空数组
- 用 `curl -X POST http://127.0.0.1:9090/api/v1/queue/default/enqueue_batch -H 'Content-Type: application/json' -d @graph.json` 就能入队
- 不打开 UI 也能跑——这是 InvokeAI 相对 ComfyUI workflow API 的头等公民能力

## 踩过的坑

1. **三种 UI 共享后端容易让新人晕**：你在 Canvas 看进度条没动，去 Linear 一看任务排在第 3 位——因为它们都在同一个 session queue 抢 GPU。装好后第一周建议只用一个 UI 模式。

2. **数据库迁移要备份**：版本跨大版本（v3 → v4 → v5）有 alembic schema 变更，跨升级前必须备份 `invokeai.db`。社区里反复出现『升完丢图』的帖子，根因是没读 release notes。

3. **VRAM cache 配错了反而慢**：`vram_cache_gb` 调太大模型来回换入换出，调太小每次推理都重新加载。SDXL + 12GB 卡的经验值是 `vram_cache_gb=4, ram_cache_gb=12`，超过得自己测。

4. **节点生态没 ComfyUI 大**：InvokeAI 的节点要写 Pydantic 类、要符合 schema 校验，门槛比 ComfyUI 的『甩一个 Python 函数进 custom_nodes/』高一档——好处是稳定，坏处是社区贡献慢。

5. **OpenAPI client 编译失败常见**：你写一个 Invocation 字段名和 Python 关键字冲突（比如 `class`、`type`），openapi-typescript 编译会炸，前端启动时会一片红。命名时回避 reserved words。

## 适用 vs 不适用场景

**适用**：

- 想给团队 / 组织做一个 SD 内部平台，要多人 / 队列 / 相册管理
- 想读懂 FastAPI + Pydantic + SQLite 这套服务端栈在 ML 推理场景怎么落地
- 想把 SD 推理嵌入业务系统，需要稳定的 REST + OpenAPI client
- 学完 A1111 / ComfyUI 想看一个工程化做得更深的对照样本

**不适用**：

- 只想快速试新模型 / 新 LoRA → A1111 生态最大、上手最快
- 要极限自定义工作流、追求最新最野的节点 → ComfyUI 社区更激进
- 显存极度受限（< 6GB）→ Forge 优化做得更狠
- 不需要相册 / 队列 / 多用户 → 上面这三个抽象就是负担

## 历史小故事（可跳过）

- **2022.08**：Stable Diffusion 1.4 权重公开几天后，Lincoln Stein 在 GitHub 起 fork `lstein/stable-diffusion`——是社区里最早能跑起来的几个之一
- **2022.10**：项目改名 InvokeAI，引入 unified canvas 雏形（早期叫 Outpainting Canvas）
- **2023**：节点系统大重写——把原来命令行 + Python 脚本的产物，重做成 Invocation API + Graph Executor，从此走上服务端化道路
- **2024**：SDXL / FLUX 支持，canvas v2 加入 regional prompting 和 control layers，节点编辑器对齐 ComfyUI 体验

A1111 是『webui 浪潮的起点』，ComfyUI 是『节点图浪潮的起点』，InvokeAI 是这两条路汇合后**最像产品**的那一支。

## 学到什么

1. **同一类工具的『工程化深度』可以差一个数量级**：A1111 是黑盒 Gradio + 文件夹约定；InvokeAI 是 FastAPI + Pydantic + SQLite + alembic + OpenAPI client。同样跑 SD，背后的工程语义完全不同
2. **schema-first 的扩展机制可以同时给到前后端**：Pydantic 一份字段定义，校验、OpenAPI、TS client 全自动出来——这是 ComfyUI 的 `INPUT_TYPES` dict 给不出的
3. **任务队列是 ML 服务端的隐藏分水岭**：能不能取消、能不能批处理、能不能断电恢复，分割了『demo』和『产品』
4. **节点图 + 关系数据库是个被低估的组合**：workflow 进 DB、产物进 DB、queue 进 DB，整套系统从此可以做 audit / 多用户 / 复跑

## 延伸阅读

- 仓库主页：[github.com/invoke-ai/InvokeAI](https://github.com/invoke-ai/InvokeAI)
- 节点开发指南：[Contributing Nodes](https://invoke-ai.github.io/InvokeAI/contributing/INVOCATIONS/)（写一个最小 Invocation 看完即懂）
- 架构总览：[Backend Overview](https://invoke-ai.github.io/InvokeAI/contributing/contribution_guides/development/)
- [[stable-diffusion-webui]] —— A1111 webui，最早把 SD 装进浏览器的 Gradio 版
- [[comfyui]] —— 节点式扩散模型 GUI，跟 InvokeAI 同走『图执行』路线但服务端更轻
- [[fastapi]] —— InvokeAI 后端的 web 框架
- [[pytorch]] —— 推理底层

## 关联

- [[stable-diffusion-webui]] —— A1111：Gradio 黑盒 vs InvokeAI 的 FastAPI 服务端，一个对照样本
- [[comfyui]] —— 同样的『节点 + 类型化端口』思想，对照看『谁更工程化、谁更社区野』
- [[fastapi]] —— InvokeAI 后端就是一个 FastAPI 应用 + Pydantic schema 全栈
- [[pytorch]] —— 扩散模型推理底层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
