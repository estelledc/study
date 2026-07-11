---
title: FastAPI — 用 Python 类型注解写 API
来源: 'https://github.com/fastapi/fastapi'
日期: 2026-05-29
分类: backend-api
难度: 中级
---

## 是什么

FastAPI 是一个**用 Python 类型注解（type hints）当合同**的 Web 框架——你在函数签名上写 `item_id: int`，框架就自动负责"从 URL 抠这个参数 → 校验是 int → 不是就报 422 → 文档里标成整数字段"。

日常类比：以前写后端像填海关申报单——你既要在表上写"我带了一台笔记本"，又要在另一张登记表上写"笔记本是电子产品"，再到第三张表上写"电子产品要交税"。FastAPI 把这三张表合成一张：你**只写一次类型**，剩下的校验、文档、序列化都自动从这一处生成。

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/items/{item_id}")
def read_item(item_id: int, q: str | None = None):
    return {"item_id": item_id, "q": q}
```

`item_id: int` 这一句让 FastAPI 自动做四件事：从路径抠值、校验是否整数、写进 OpenAPI 文档、IDE 给你补全。**写一处，省四处**。

## 为什么重要

不理解 FastAPI 解决的问题，下面这些事都没法解释：

- 为什么 2020 年后 Python 后端一边倒选它，Flask / Django 在新项目里份额下滑
- 为什么 Microsoft / Uber / Netflix 这种规模的公司也在用一个个人开源项目（80k+ stars）
- 为什么写一个 API 不用手写 Swagger，访问 `/docs` 就有交互式文档可点
- 为什么 ML 推理服务（torch / transformers）几乎都用 FastAPI 暴露——类型校验天然挡住脏输入

它把"Python 类型注解"这个 PEP 484（2014）以来一直没用满的能力，变成了**整个框架的中枢神经**。

## 核心要点

FastAPI 的设计可以拆成 **三块**：

1. **类型注解驱动一切**：`item_id: int` 不是给 IDE 看的注释，是运行时实际生效的合同。FastAPI 读这个注解 → 生成 Pydantic 校验器 → 失败抛 422 → 同时写进 OpenAPI schema。一处声明，四处复用。

2. **Pydantic 当数据模型**：复杂请求体（JSON body）用 `class Item(BaseModel)` 描述，Pydantic 帮你 parse + validate。类比拼乐高：BaseModel 是"零件标准"，请求过来 FastAPI 试图把零件拼上去，对不上的位置自动报错。

3. **Depends() 实现依赖注入**：把"每个接口都要做的事"（取当前用户、连数据库、做权限校验）写成函数，在路由签名里 `Depends(get_user)` 引入。框架在调用 handler 前自动跑依赖、把结果传进来——和 Spring 的 @Autowired 思想接近，但写法纯函数。

底层栈：FastAPI = **Starlette（ASGI 层）+ Pydantic（校验层）+ 类型注解魔法**。它本身只有几千行，重活都委托出去。

## 实践案例

### 案例 1：路径参数 + 查询参数自动校验

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/users/{user_id}")
def get_user(user_id: int, include_email: bool = False):
    return {"id": user_id, "email_visible": include_email}
```

**逐部分解释**：

- `user_id: int` → 访问 `/users/abc` 直接返回 422 "not a valid integer"，handler 根本不会被调
- `include_email: bool = False` → 因为有默认值，自动识别为查询参数；`?include_email=true` 解析成 True
- 启动后访问 `/docs` 已有可点击的 Swagger UI——**没写一行文档**

### 案例 2：请求体用 Pydantic 模型

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class CreateItem(BaseModel):
    name: str
    price: float
    tags: list[str] = []

@app.post("/items")
def create_item(item: CreateItem):
    return {"saved": item.name, "total_tags": len(item.tags)}
```

POST `{"name": "book", "price": "abc"}` → 框架返回 `{"detail":[{"loc":["body","price"],"msg":"value is not a valid float"}]}`。**handler 拿到的 `item` 一定是合规的**——这是 type hint 在运行时生效的力量。

### 案例 3：Depends 把鉴权抽出来

```python
from fastapi import Depends, FastAPI, HTTPException, Header

app = FastAPI()

def current_user(x_token: str = Header()):
    if x_token != "secret":
        raise HTTPException(401, "bad token")
    return {"id": 42, "name": "jason"}

@app.get("/me")
def me(user: dict = Depends(current_user)):
    return user
```

任何路由加上 `user = Depends(current_user)` 就自动接入鉴权链，handler 拿到的永远是已登录用户。**鉴权逻辑只写一遍**，所有路由复用。

## 踩过的坑

1. **`def` 还是 `async def` 选错会卡线程池**：用 `async def` handler 里调用同步阻塞函数（`requests.get` / 同步 ORM）会卡住整个 event loop。要么用 `httpx` 异步客户端，要么把 handler 改回 `def`——FastAPI 会把同步函数丢进线程池跑，反而更安全。

2. **Pydantic v1 → v2 不兼容**：FastAPI 0.100 之后默认 Pydantic v2，`@validator` 改成 `@field_validator`，`.dict()` 改成 `.model_dump()`，老项目升级时大量代码要改。pin 死版本号是关键。

3. **`response_model` 会"偷偷"过滤字段**：声明 `response_model=Item` 后，handler 返回的 dict 里多出来的键会被静默丢掉。很多人 debug "为什么前端拿不到这个字段"半天，其实是 response_model 没声明它。

4. **后台任务（BackgroundTasks）和 Depends 不对等**：`Depends(get_db)` 在请求结束后自动关连接，但写进 `BackgroundTasks.add_task` 的函数没有这个机制，常导致连接泄漏。后台任务里要手动管理资源。

## 适用 vs 不适用场景

**适用**：

- REST API 后端、微服务、内部 BFF
- ML / LLM 推理服务（输入校验 + 文档自动出 = 模型部署刚需）
- 数据管道的 HTTP 触发面（Pydantic 把脏 JSON 挡在外面）
- 快速 prototype / hackathon——半天能写出一个有完整文档的 API

**不适用**：

- 需要服务端渲染 HTML 网站（Django / Flask + Jinja 更顺手）
- 超低延迟（< 1ms）场景 → Go / Rust 框架更合适，Python GIL 是天花板
- 需要 Django ORM + admin 面板的"全家桶"项目 → FastAPI 没有官方 ORM，要自己拼 SQLAlchemy / Tortoise
- 团队 Python 经验偏弱、type hints 不熟 → 类型不准时报错信息很难懂，反而拖慢节奏

## 历史小故事（可跳过）

- **2014 年**：Python 3.5 落地 type hints（PEP 484）。当时大多数人当注释看，没人在运行时用它做事。
- **2018 年 12 月**：哥伦比亚开发者 Sebastián Ramírez（GitHub: tiangolo）写出 FastAPI 0.1。核心思路："如果框架真的去读类型注解会怎样？"
- **2019-2020 年**：TechEmpower 基准测出 FastAPI 接近 Go / Node 性能（站在 Starlette + Uvicorn 肩膀上），社区爆发。
- **2021 年**：Microsoft / Uber / Netflix 公开使用，Tiangolo 加入 Sequoia 投的 cloud 创业。
- **2023-2026 年**：Pydantic v2 用 Rust 重写校验层，FastAPI 0.100+ 跟进，性能再提一档；80k+ stars 成 Python 后端事实标准。

## 学到什么

1. **把现有语言能力榨到极致** 比发明新语法更聪明——类型注解 PEP 484 等了四年才被框架级利用，但一旦用起来就赢了
2. **"声明一次、生成多处"** 是 DX 的圣杯：类型 → 校验 + 文档 + IDE + 客户端 SDK，单一真相源比手工同步好太多
3. **抽象站在巨人肩上**：FastAPI 自己不重复造 ASGI 服务器（Uvicorn）/ 校验引擎（Pydantic）/ 路由（Starlette），它只是"把这三个粘起来 + 加类型魔法"
4. **个人开源项目可以跑赢公司框架**：tiangolo 一个人主导，但社区贡献者 700+，节奏比 Django/Flask 灵活——好的设计 > 资源堆砌

## 延伸阅读

- 官方教程：[fastapi.tiangolo.com](https://fastapi.tiangolo.com/tutorial/)（中文完整翻译，按段写、能跑）
- 视频：[ArjanCodes — FastAPI Tutorial Series](https://www.youtube.com/results?search_query=arjancodes+fastapi)（半小时一集，从 0 到部署）
- [[hono]] —— JS / TS 世界的同位概念，多运行时 + 类型友好
- [[langchain]] —— 与 FastAPI 经常配对：LangChain 写 AI 逻辑，FastAPI 当 HTTP 入口
- [[hindley-milner]] —— 类型推导的理论根，FastAPI 用的是 type hint 静态校验，思路相似

## 关联

- [[hono]] —— TS 版 "type-first 框架"，二者是各自语言里的同位
- [[express]] —— 老一代 callback 风格，FastAPI 是 Python 后端"async + type"的对应升级
- [[nestjs]] —— TS 装饰器 + DI 的企业风格，FastAPI 用函数 + Depends 实现同类思想
- [[trpc]] —— 同样追求"声明一次、类型贯穿前后端"，但走 RPC 不走 REST
- [[langchain]] —— LLM 应用层最常用的部署方式就是包成 FastAPI 接口
- [[hindley-milner]] —— "类型注解是合同" 的思想根，HM 是数学定理，FastAPI 是它的工程化日用版
- [[redis]] —— FastAPI 项目里几乎必出现的 cache / session 后端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

