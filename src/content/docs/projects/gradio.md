---
title: Gradio — ML 模型 demo 框架
来源: 'https://github.com/gradio-app/gradio'
日期: 2026-06-01
分类: projects / 数据可视化
难度: 入门
---

## 是什么

Gradio 是 Stanford 团队 Abubakar Abid 等五人 2019 年发起的开源 Python 库，配套论文发在 ICML 2019 demo track，2021 年 12 月被 HuggingFace 整体收购，至今以 Apache-2.0 公开开发，GitHub 上约 36k 星。日常类比：你写好了一个 Python 函数（比如"输入图片，返回猫狗概率"），Gradio 替你套一层浏览器外壳——别人在网页里上传图片、点按钮，函数就被调一次，结果回填到页面。

最小例子，**5 行**：

```python
import gradio as gr

def greet(name):
    return f"Hello {name}"

gr.Interface(fn=greet, inputs="text", outputs="text").launch()
```

跑起来终端打印 `http://127.0.0.1:7860`，浏览器自动开一个有输入框、提交键、输出区的页面。**没写一行 HTML / JS / FastAPI 路由**，就有了一个跑在浏览器里的"函数试用台"。

## 为什么重要

不理解 Gradio，下面这些事都没法解释：

- 为什么 HuggingFace Spaces 上**大量**模型卡都有一个"Try it"按钮——背后往往是 push 一个 `app.py` 到 Space repo，CI 自动起容器、暴露 URL，原生 SDK 就是 Gradio
- 为什么研究员写完模型敢直接发链接给同事看效果——`launch(share=True)` 给一个 `*.gradio.live` 公网地址，72 小时有效，背后是自建反向隧道
- 为什么 AUTOMATIC1111 Stable Diffusion WebUI 1.x 整套界面、Whisper 早期 demo、各类 LLM 试玩页都长得像同一家——它们底下都是 Gradio 组件
- 为什么 HuggingFace 愿意把整个团队收下——Spaces 平台的活跃 demo 边际成本被 Gradio 压到了 git push

## 核心要点

Gradio 的设计哲学和 [[streamlit]] 不一样。Streamlit 是"整段重跑"，Gradio 是**函数即接口**：你声明"输入是什么类型、输出是什么类型、要调哪个函数"，框架替你接前后端。理解这一点，整套 API 都顺：

1. **两层 API**：`gr.Interface` 是最简包装（函数 + 输入 + 输出三件套），底层用 `gr.Blocks` 构建。`Blocks` 是低层 API，可自定义布局、多事件、组件互联、多 tab。简单 demo 用前者，正经应用用后者。

2. **组件 = 类型**：`Textbox` / `Image` / `Audio` / `Video` / `File` / `Dataframe` / `Slider` / `Chatbot` / `Plot` / `Model3D` / `Gallery` 等四十多种内置组件，每个组件既是输入控件、又是输出渲染器。声明 `inputs="image"` 等同于 `inputs=gr.Image()`。

3. **事件绑定**：`Blocks` 里写 `btn.click(fn, inputs=[a, b], outputs=[c])` 就把按钮点击连到函数；可以多个事件绑同一函数、一个事件触发多函数链式更新。比 Streamlit 的"重跑"更接近传统 Web 思维。

4. **聊天专用糖**：`gr.ChatInterface(fn)` 一行得到聊天 UI——流式输出、多轮 history、文件上传、思考中状态全自带。LLM 应用原型几乎都从这里起步。

5. **队列**：内置 `queue`，`concurrency_limit` 限并发避免显存爆，`max_size` 限排队长度，前端实时显示队伍位置。ML 推理天然慢、天然容易撞 OOM，这一层没它就裸奔。

底层架构一句话：用 **FastAPI**（3.0 起；更早是 Flask）在服务器上接 HTTP 请求，**Uvicorn** 负责把异步服务跑起来（ASGI = 异步版的"服务器接口约定"）。前端是 Svelte 编译出的网页组件；普通交互走 REST / WebSocket，流式输出常用 SSE（服务器持续推字），5.0 起音视频还可走 WebRTC。

## 实践案例

### 案例 1：图片分类 demo

```python
import gradio as gr
from transformers import pipeline

clf = pipeline("image-classification")

def predict(img):
    out = clf(img)
    return {x["label"]: x["score"] for x in out}

gr.Interface(
    fn=predict,
    inputs=gr.Image(type="pil"),
    outputs=gr.Label(num_top_classes=3),
).launch()
```

不到 10 行得到：拖拽上传图片 / 调模型 / 标签 + 概率条形图。`gr.Label` 自动把 dict 渲染成可视化——这种"组件懂数据形状"的多态在 Gradio 里到处都是。

### 案例 2：用 Blocks 自定义布局

```python
def translate(text):  # 占位：接真实翻译 API 即可
    return f"[译] {text}"

with gr.Blocks() as demo:
    gr.Markdown("## 双语翻译")
    with gr.Row():
        src = gr.Textbox(label="原文", lines=4)
        dst = gr.Textbox(label="译文", lines=4, interactive=False)
    btn = gr.Button("翻译")
    btn.click(fn=translate, inputs=src, outputs=dst)

demo.launch()
```

`Blocks` 像 with-block 拼版式：`Row` 横排、`Column` 竖排、`Tab` 多页。比 `Interface` 啰嗦，但能放得下"多输入混一个事件、一个函数刷新好几个区域"这种复杂交互。

### 案例 3：ChatInterface 给 LLM 套壳

```python
def respond(message, history):
    # 占位：把 call_llm 换成你的模型调用
    for chunk in [f"收到：{message}", " …（流式）"]:
        yield chunk

gr.ChatInterface(fn=respond).launch()
```

返回 generator 就自动走流式输出。`history` 是多轮对话列表，框架替你维护。配合 `additional_inputs=[gr.Slider(...)]` 还能在聊天框旁边挂调参面板。

## 踩过的坑

1. **`launch(share=True)` 不是生产部署**：share 链接 72 小时过期，且依赖 gradio.live 中转服务器，单点、限速、不能定制域名。生产用 docker 自己起 uvicorn，或者直接 push 到 Spaces。

2. **不写 `queue` 上来就崩**：默认 `Interface` 已开 queue，但 `Blocks` 里如果手动 `demo.queue(concurrency_limit=...)` 漏写，多个用户同时点会全部塞进同一个 GPU——OOM 几乎必然。

3. **组件类型和函数签名要对齐**：`inputs=gr.Image(type="pil")` 给函数的是 `PIL.Image`；改成 `type="numpy"` 就是 `np.ndarray`；改 `type="filepath"` 是磁盘路径字符串。函数里 assert 一下能少很多奇怪 bug。

4. **session 概念隐式**：Gradio 默认每个浏览器 tab 一个独立 session，`gr.State()` 维护 per-session 状态。但服务重启 state 全丢——长会话要落外部存储，框架不替你管。

5. **Spaces 部署偶发拉不到依赖**：`requirements.txt` 写了不一定按预期版本——加 `==` 锁定；用到系统库（ffmpeg / cuda）要写 `packages.txt`。

6. **5.0 升级有 break**：Python 最低版本提到 3.10，部分组件 API 改名（`gr.outputs.Label` → `gr.Label`），老教程跑 5.x 会报 ImportError——看官方迁移指南。

## 适用 vs 不适用场景

**适用**：

- ML / LLM 模型 demo——HuggingFace Spaces 一键部署、`ChatInterface` 一行搞定 LLM 试玩
- 研究室内部评测平台——多个模型并排、上传测试集、看混淆矩阵
- 给非工程同事或外部分享原型——`share=True` 直接发链接、72 小时够看一轮
- 单一函数包装——"输入 X 输出 Y"的封装天然契合 `Interface`

**不适用**：

- 复杂多页应用 / 数据探索面板——[[streamlit]] 的 rerun 模型在"调一调看一看"场景更顺
- 多用户隔离严格的生产应用——session 模型简单，权限 / 鉴权要自己接
- 高并发面向 C 端——单进程 + queue 不擅长万级 QPS，要前面套 nginx + 多副本
- SEO / 公开内容站——本质是 SPA，搜索引擎友好度差

## 历史小故事（可跳过）

- **2019 年**：Abubakar Abid 等在 Stanford 做出 Gradio，ICML 2019 demo track 亮相，目标是让研究员 5 行代码分享模型
- **2021 年 12 月**：Hugging Face 收购 Gradio，Spaces 把"git push → 可点 demo"做成平台默认路径
- **2022–2023 年**：`Blocks` / `ChatInterface` 成为 LLM 试玩页标配；AUTOMATIC1111 等 WebUI 把它推到圈外用户桌面
- **2024 年**：Gradio 5.0 升 Python 3.10+、整理组件 API，音视频链路进一步 WebRTC 化

## 学到什么

1. **接口形态要贴合场景**：ML demo 的本质是"函数试用台"，Gradio 的 `Interface` 直接把"函数签名 + 输入输出类型"映射成 UI，比通用 Web 框架短一个数量级
2. **组件懂数据形状**：`gr.Label` 接 dict 出条形图、`gr.Dataframe` 接 DataFrame 出表格——多态比类型安全更适合 demo 阶段
3. **隧道 + 平台 = 体验飞跃**：share 隧道把"本地能跑"和"同事能看"中间那道墙拆了；Spaces 又把"能看"和"能稳定服务"那道墙拆了
4. **降低 demo 边际成本释放需求**：研究员写完模型不用再求前端帮忙，Gradio 让"模型→可分享 URL"变成 git push——HuggingFace 收购买的就是这条曲线

## 延伸阅读

- 官方文档：[Gradio Docs](https://www.gradio.app/docs)（Quickstart 一节即学即用）
- 收购公告：[Gradio is joining Hugging Face](https://huggingface.co/blog/gradio-joins-hf)（2021 年 12 月）
- Custom Components：[gradio cc create](https://www.gradio.app/guides/custom-components-in-five-minutes)（4.x 起的扩展机制）
- [[streamlit]] —— 同代 Python web 应用框架，思路不一样
- [[fastapi]] —— Gradio 3.0 起的后端 ASGI 引擎
- [[svelte]] —— Gradio 前端实现栈

## 关联

- [[streamlit]] —— ML demo 双雄之一；Streamlit 偏数据应用、Gradio 偏模型 IO
- [[fastapi]] —— Gradio 3.0+ 后端基座
- [[svelte]] —— Gradio 前端实现栈
- [[stable-diffusion-webui]] —— AUTOMATIC1111 1.x 整套 UI 用 Gradio 拼出
- [[whisper]] —— 早期 demo 页就是 Gradio
- [[react]] —— [[streamlit]] 选 React、Gradio 选 Svelte，对比能看出"嵌入性"和"生态"的取舍

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
