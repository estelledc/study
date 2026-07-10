---
title: Plug — 把 HTTP 中间件写成『conn 进 conn 出』的纯函数
来源: 'https://github.com/elixir-plug/plug'
日期: 2026-05-30
分类: 后端开发
难度: 中级
---

## 是什么

Plug 是 Elixir 生态的 **HTTP 中间件规范 + 一组适配器**。日常类比：像一条流水线上的工位——前一个工位把『一个 connection 盒子』递过来，你在盒子里加点东西（写一个 header / 验一下登录 / 记一条日志），再原样递给下一个工位。每个工位都是一个普通函数，盒子始终是同一类盒子。

它定义了两件事：

- **协议**：什么样的函数算一个 plug——必须接收一个 `Plug.Conn` 并返回一个 `Plug.Conn`
- **适配器**：把 Cowboy / Bandit 这些底层 web server 收上来的请求，包装成统一的 `Plug.Conn` 喂给上层

```elixir
defmodule HelloPlug do
  def init(opts), do: opts
  def call(conn, _opts) do
    Plug.Conn.send_resp(conn, 200, "Hello, Plug")
  end
end
```

签名固定就两条：`init/1`（编译期算配置）+ `call/2`（运行期处理 conn）。Phoenix 的每个 controller、每个 endpoint，剥到最里面都是这两条。

## 为什么重要

不理解 Plug，下面这些事都没法解释：

- 为什么 Phoenix 的中间件可以直接跨项目复用——它们都是 Plug，不是 Phoenix 专属
- 为什么 Elixir 社区可以平滑从 Cowboy 切到 Bandit，业务代码一行不改
- 为什么 Elixir 没有像 Express / Koa 那样满天飞的 middleware 装饰器——一个 plug spec 把所有写法统一了
- 为什么 José Valim 在 2013 年就把这套抽象定下来——他直接抄了 Ruby Rack 的作业，加上 Erlang VM 的 immutability

## 核心要点

Plug 的设计可以拆成 **三个支点**：

1. **Conn 是不可变盒子**：所有操作都返回**新的** `%Plug.Conn{}`，不修改原来的。类比：流水线的零件每次加工都装进新盒子，不在原盒子上涂抹。这让并发安全 + 时间旅行调试都成立。

2. **Plug 有两种写法，等价**：
   - **函数 plug**：`def my_plug(conn, opts), do: ...`，适合一次性逻辑
   - **模块 plug**：定义 `init/1` + `call/2`，适合复用 + 配置

3. **Builder 把 Plug 串成 pipeline**：`use Plug.Builder` 后用 `plug Logger`、`plug :auth` 一行一层。Builder 在编译期把这些串成一个嵌套调用链，运行时零反射、零开销。

三个支点合起来：**写中间件像写普通函数，组装应用像搭乐高积木**。

## 实践案例

### 案例 1：Hello Plug——最简模块 plug

```elixir
defmodule MyApp.HelloPlug do
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    conn
    |> put_resp_content_type("text/plain")
    |> send_resp(200, "Hello, Plug")
  end
end
```

**逐部分解释**：

- `init/1` 在**编译期**调用，返回的 opts 会被烤进运行时——适合放静态配置
- `call/2` 在**运行期**每个请求调一次，拿到 conn，加工后返回新 conn
- `|>` 是 Elixir 的管道——`a |> f(b)` 等价 `f(a, b)`，让流水线读起来像英文

跑起来需要再加适配器：

```elixir
{:ok, _} = Plug.Cowboy.http(MyApp.HelloPlug, [])
```

### 案例 2：Pipeline——用 Builder 串多层中间件

```elixir
defmodule MyApp.Pipeline do
  use Plug.Builder

  plug Plug.Logger
  plug Plug.Parsers, parsers: [:json], json_decoder: Jason
  plug :auth_required

  def auth_required(conn, _opts) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> _token] -> conn
      _ -> conn |> send_resp(401, "Unauthorized") |> halt()
    end
  end
end
```

**逐部分解释**：

- `use Plug.Builder` 让模块本身变成一个 plug——`call/2` 由 macro 自动生成，按 `plug` 出现顺序串调用
- 第三个 `plug :auth_required` 是**函数 plug**，本模块自带的 `auth_required/2`
- `halt(conn)` 给 conn 打『终止』标记——后续的 plug 全部跳过，常用于鉴权失败提前返回
- `Plug.Parsers` 是社区标准件，自动把 JSON body 解到 `conn.body_params`

### 案例 3：Plug.Router——一个 mini API

```elixir
defmodule MyApp.Router do
  use Plug.Router

  plug :match
  plug :dispatch

  get "/hello/:name" do
    send_resp(conn, 200, "hi, #{name}")
  end

  match _ do
    send_resp(conn, 404, "not found")
  end
end
```

**逐部分解释**：

- `use Plug.Router` 把 `get / post / put / match` 这些 macro 引进来
- `:match` 和 `:dispatch` 是 Router 的两个内置 plug——前者把请求和声明的路由对上号，后者执行对应 handler
- `get "/hello/:name"` 把 `:name` 自动绑成本地变量，方便插值
- `match _` 是兜底——**少了这条**，没匹配的路径会抛 `FunctionClauseError`，新人坑（见踩坑 3）

## 踩过的坑

1. **Conn 是 immutable，忘用返回值就丢**：`put_resp_header(conn, ...)` 不改原 conn，**返回**新 conn。新人常写 `put_resp_header(conn, ...)` 一行后再 `send_resp(conn, ...)`——结果 header 没生效。

2. **send_resp 之后就锁死**：一旦调了 `send_resp/3`，响应已经写到 socket，再插 plug 也改不了 status code。中间件要做后置处理（如 metrics）必须用 `register_before_send/2` 钩子。

3. **Plug.Router 必须有 catch-all**：路由匹配是函数模式匹配——没匹配到任何 `match`/`get`/`post`，Erlang 直接抛 `FunctionClauseError`。永远在最后写 `match _ do send_resp(conn, 404, ...) end`。

4. **init 在编译期跑**：`init/1` 的返回值会被宏烤进 BEAM 字节码——你在 init 里读 `System.get_env/1` 拿到的是**编译机器的环境变量**，不是部署机器的。运行期配置必须放 `call/2`，或在 Builder 上写 `use Plug.Builder, init_mode: :runtime`（注意不是虚构的 `runtime_init: true`）。

## 适用 vs 不适用场景

**适用**：
- Elixir / Erlang VM 上的任何 HTTP 服务——Phoenix / Bandit / 单机 API / Webhook 接收器
- 需要可复用、可测试的中间件——日志 / 鉴权 / 限流 / 解析
- 想绕过 Phoenix 的"全家桶"，自己组一套轻量 web stack

**不适用**：
- 非 Erlang VM 的服务（Plug 只在 BEAM 上跑）
- 需要 WebSocket / 长连接为主的服务——用 Phoenix Channels 或 Bandit 的 WebSock 适配
- 极简静态文件 server——直接用 `Plug.Static` 一个 plug 也行，但不如 nginx

## 历史小故事（可跳过）

- **2013 年**：José Valim（Elixir 之父）发布 Plug 0.1，明摆着抄 Ruby Rack 的作业——Rack 也是 `call(env)` 进、`[status, headers, body]` 出的纯函数协议
- **2014 年**：Phoenix 框架发布，底层完全建在 Plug 之上——这让"Phoenix 中间件"和"普通 Plug"成为同一种东西
- **2023 年**：Bandit web server 出来，纯 Elixir 实现，性能反超 Cowboy；切换只需要改一行 `Plug.Cowboy` → `Bandit`，业务零改动——这就是 Plug 抽象的红利

## 学到什么

1. **协议先于实现**——Plug 不是一个库，而是一份『签名约定』。库可以替换，约定不变
2. **immutable + pipeline = 易测试**——每个 plug 输入输出都是 conn，可以单独 unit test，不需要起 server
3. **编译期 vs 运行期分开**——init/1 vs call/2 的对偶设计，把"配置一次"和"每请求一次"的成本明确切开
4. **抄好作业不丢人**——Rack（Ruby）→ Connect（Node）→ Plug（Elixir），同一种思想跨了三种语言

## 延伸阅读

- 官方文档：[hexdocs.pm/plug](https://hexdocs.pm/plug)（API 全集，看 `Plug.Conn` 和 `Plug.Router`）
- Phoenix 是怎么用 Plug 的：[Phoenix Endpoint 源码](https://github.com/phoenixframework/phoenix/blob/main/lib/phoenix/endpoint.ex)
- Ruby 的 [Rack spec](https://github.com/rack/rack/blob/main/SPEC.rdoc)——Plug 抄的对象
- [[axum]] —— Rust 等价物，用类型系统当 extractor，思路相通
- [[fastapi]] —— Python 等价物，用类型注解描述请求/响应

## 关联

- [[axum]] —— Rust 异步 web 框架，handler-as-function 思路一致
- [[actix-web]] —— Rust 另一选择，actor 模型，与 Plug 哲学相反
- [[warp]] —— Rust filter pipeline，与 Plug.Builder 串接思路同源
- [[fastapi]] —— Python 把 Plug 思路用类型注解再实现一遍
- [[phoenix]] —— 建在 Plug 之上的全栈框架；Endpoint 本身就是一条 Plug pipeline

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
