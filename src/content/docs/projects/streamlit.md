---
title: Streamlit — Python 几行写 Web 应用
来源: 'https://github.com/streamlit/streamlit'
日期: 2026-06-01
分类: projects / 数据可视化
难度: 入门
---

## 是什么

Streamlit 是 Adrien Treuille / Thiago Teixeira / Amanda Kelly 三人 2018 年在 Uber 离开后做的开源框架，2019 年 10 月公开，2022 年 3 月被 Snowflake 以约 8 亿美元收购，至今仍以 Apache-2.0 License 公开开发。日常类比：像把一份 Jupyter Notebook 的运行结果搬到一个浏览器标签里，但顺手多送你一组下拉框 / 滑块 / 按钮，让别人不写代码也能调你的脚本。

最小例子：

```python
import streamlit as st

st.title("我的第一个应用")
name = st.text_input("你叫什么")
n = st.slider("重复几次", 1, 10, 3)

if name:
    st.write(("你好，" + name + "！") * n)
```

存为 `app.py`，命令行 `streamlit run app.py`，浏览器自动开 `http://localhost:8501`。**没写一行 HTML / CSS / JS / Flask 路由 / WebSocket**，就有了一个能输入、能交互、能实时刷新的 Web 应用。

## 为什么重要

不理解 Streamlit，下面这些事都没法解释：

- 为什么 HuggingFace Spaces 上相当一部分 ML demo 用 Streamlit 或 [[gradio]]——它们把"会写 Python"和"做出能分享 URL 的 demo"中间那道墙拆了
- 为什么数据科学团队的内部工具不再走 Flask + React 双轨——Streamlit 让分析师本人就能交付一个"老板能点的"页面
- 为什么 LLM 应用原型常从 Streamlit 起步——`st.chat_input` / `st.chat_message` 直接给一套对话 UI
- 为什么 Snowflake 愿意花约 8 亿美元买它——把 Streamlit 嵌进 Snowflake 后，BI 报表和数据应用合二为一

## 核心要点

Streamlit 的设计哲学是**从上到下重跑**（rerun from top）：每次用户动一下控件，整段 Python 脚本**从头执行一遍**，只是这次 `slider` 返回的是新值。理解这一点，整套 API 都顺：

1. **显示**：`st.write` 多态——传 str / number / DataFrame / matplotlib Figure / Altair Chart / [[plotly-js]] Figure / dict 都能渲染。`magic` 是更短的写法：在脚本里裸写 `df` 这一行就等于 `st.write(df)`。

2. **控件**：`st.slider` / `st.selectbox` / `st.text_input` / `st.button` / `st.file_uploader` 等三十多个，**每个调用返回控件当前值**——这是和传统 Web 框架最大的差别，没有 onClick 回调。

3. **布局**：`st.sidebar` / `st.columns(n)` / `st.tabs([...])` / `st.expander(...)` / `st.container()` 把页面切块。配合 `with col1: ...` 上下文管理器组装。

4. **缓存 + 状态**：`@st.cache_data` 缓存"返回数据的纯函数"（结果会被复制）、`@st.cache_resource` 缓存"全局单例"（DB 连接、ML 模型——不复制）。`st.session_state` 是一个跨 rerun 持久化的 dict，存"用户选过什么、聊到第几轮"。

5. **多页应用**：在 `pages/` 目录下放多个 .py 文件，自动出现在侧边栏导航——零配置。Streamlit 1.10 以后还支持 `st.navigation` 显式定义。

底层架构：Tornado 起 HTTP + WebSocket server，前端是 React 应用，每次脚本重跑生成的 ForwardMsg 通过 WebSocket 推到前端，前端按 ID diff 后局部更新 DOM——所以从用户视角看是"局部刷新"，从开发者视角是"整段重跑"。

## 实践案例

### 案例 1：写一个真能用的数据探索器

```python
import streamlit as st
import pandas as pd

st.title("CSV 探索器")

uploaded = st.file_uploader("上传 CSV", type="csv")
if uploaded:
    df = pd.read_csv(uploaded)
    st.write("形状：", df.shape)

    col = st.selectbox("选一列看分布", df.columns)
    st.bar_chart(df[col].value_counts())
    st.dataframe(df.head(100))
```

**逐部分解释**：

1. `file_uploader` 拿到上传文件对象；没有文件时后面不跑，避免空表报错
2. `read_csv` 把 CSV 变成 DataFrame，`shape` 先让人看见规模
3. `selectbox` 用列名当选项；`bar_chart` 画该列频次；`dataframe` 只展示前 100 行

### 案例 2：缓存把慢操作摁住

```python
@st.cache_data(ttl=600)
def load_big_csv(path: str) -> pd.DataFrame:
    return pd.read_csv(path)  # 假设要 5 秒

@st.cache_resource
def load_model():
    from transformers import pipeline
    return pipeline("sentiment-analysis")

df = load_big_csv("data.csv")
clf = load_model()
text = st.text_area("输入文本")
if text:
    st.write(clf(text))
```

**逐部分解释**：

1. `@st.cache_data` 按参数 hash 缓存返回值：第一次约 5 秒，之后毫秒级；`ttl=600` 十分钟后失效
2. `@st.cache_resource` 缓存模型单例，不复制——多用户共享同一对象
3. 控件只影响后面的推理；读表和装模型不会因每次 rerun 重做

### 案例 3：用 session_state 写一个聊天应用

```python
if "msgs" not in st.session_state:
    st.session_state.msgs = []

for m in st.session_state.msgs:
    with st.chat_message(m["role"]):
        st.write(m["content"])

if prompt := st.chat_input("说点什么"):
    st.session_state.msgs.append({"role": "user", "content": prompt})
    reply = call_llm(prompt)  # 自行接入任意 LLM 客户端
    st.session_state.msgs.append({"role": "assistant", "content": reply})
    st.rerun()
```

**逐部分解释**：

1. 首次进入时初始化 `msgs`；`session_state` 跨 rerun 保留历史
2. 循环用 `chat_message` 按角色渲染气泡（1.24+ 语义化控件）
3. `chat_input` 收到新句 → 追加 user/assistant → `st.rerun()` 立刻重画

## 踩过的坑

1. **每次交互整段重跑**：滑一下 slider，整个 `app.py` 从头执行——昂贵的计算（读数据 / 推理）必须用 `cache_data` / `cache_resource` 包住，否则用户每点一次等十秒。

2. **for 循环里画图状态难追**：循环里 `st.plotly_chart(fig)` 每轮新画，但要在循环里维护"用户选了哪根线"几乎不可能——状态要预先放 `session_state`，循环里只读。

3. **cache_data 要求参数可 hash**：`@st.cache_data` 用 args 做 key，传 DataFrame / dict 进去会按内容 hash（慢但能跑），传不可 hash 对象（如 DB 连接）会报错——这种场景用 `cache_resource`。

4. **widget key 冲突**：在循环里造同样的 `st.button("delete")` 会撞 key，要显式传 `key=f"del-{i}"`。Streamlit 的"控件身份"绑定 (脚本位置 + label + key)，重名就当同一个。

5. **大表用错 API / 跨 session 丢数据**：`st.write(df)` 超约 5 万行易卡，改用 `st.dataframe`；`session_state` 只活在单 tab，持久化要接数据库或文件。

## 适用 vs 不适用场景

**适用**：

- ML / LLM demo 给非工程同事或外部分享——HuggingFace Spaces 一键部署
- 数据科学团队自助式内部工具——分析师自己交付页面，不再"扔给前端"
- 探索性原型验证想法——15 分钟从 Jupyter 搬到可点击的应用
- 配置型工具页面（"调参 + 跑一次 + 看结果"）——天然契合

**不适用**：

- 多人协同 / 多用户隔离严格的生产应用——重跑模型简单但权限管理薄
- 复杂前端交互（拖拽 / 富文本编辑器 / 自定义动画）——要写 [[react]] Component 嵌入，复杂度反超传统栈
- 高并发面向 C 端——单脚本进程模型不擅长万级 QPS
- SEO / 公开内容站——SPA 渲染对搜索引擎不友好，应转 Astro / Next.js

## 历史小故事（可跳过）

- **2018 年**：Treuille / Teixeira / Kelly 离开 Uber 后开始做 Streamlit，目标是让数据科学家用纯 Python 交付可交互页面
- **2019 年 10 月**：开源公开，迅速成为 ML demo 与内部工具的默认选项之一
- **2022 年 3 月**：Snowflake 以约 8 亿美元收购，产品继续 Apache-2.0 开源
- **之后**：`st.chat_*`、多页导航与组件生态把原型从报表推到 LLM 对话应用

## 学到什么

1. **执行模型可以决定 API 形态**：rerun-from-top 让 Streamlit 不需要状态机 / 回调 / 路由——回调全被"下一次重跑"代替，写起来像 Notebook 但跑起来像 Web 应用
2. **多态 API 比类型安全更适合 demo 场景**：`st.write` 接受任何东西、自动选合适渲染器，让用户专注"我有什么数据"而不是"该调哪个函数"
3. **缓存是 Web 应用最重要的一层**：把慢操作和会话状态分开管（cache 数据 vs session_state 状态），是把"脚本式应用"做出生产质感的关键
4. **降低 demo 边际成本释放巨大需求**：Streamlit 之前，做一个能分享的 ML demo 要写 Flask + 前端 + 部署；之后只剩一行 `streamlit run`——Snowflake 8 亿美金买的就是这条曲线

## 延伸阅读

- 官方文档：[Streamlit Docs](https://docs.streamlit.io/)（API Reference 一栏即学即用）
- API 速查：[Streamlit Cheat Sheet](https://docs.streamlit.io/library/cheatsheet)
- 对比文章：[Streamlit vs Gradio vs Dash](https://blog.streamlit.io/streamlit-vs-dash/)（官方视角，仍可读）
- [[gradio]] —— HuggingFace 系的同代竞品，主打模型 IO
- [[plotly-js]] —— Streamlit 默认接受的交互图引擎之一
- [[altair]] —— `st.altair_chart(chart)` 的输入即 Altair 对象

## 关联

- [[gradio]] —— ML demo 双雄之一，Streamlit 偏数据应用、Gradio 偏模型 IO
- [[altair]] —— `st.altair_chart` 一键嵌入交互图
- [[plotly-js]] —— Streamlit 内置渲染器之一
- [[fastapi]] —— 真正后端 API 场景的下一步，Streamlit 跨过去用 FastAPI
- [[jupyter-notebook]] —— Streamlit 思维上从 Notebook 演化而来
- [[react]] —— Streamlit 前端的实现栈

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
