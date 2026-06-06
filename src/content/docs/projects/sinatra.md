---
title: Sinatra — 用 Ruby 三行代码起一个 web 服务
来源: 'https://github.com/sinatra/sinatra'
日期: 2026-05-30
子分类: Web 后端
分类: 后端 API
难度: 初级
provenance: pipeline-v3
---

## 是什么

Sinatra 是一个用 **Ruby** 写的极简 web 框架。日常类比：如果 Rails 像一栋装修好的精装公寓——开门就能住，但你想改格局得先拆墙；那 Sinatra 像一间空毛坯房——只给你水电和承重墙，桌椅家具完全自己挑。

最经典的"三行 Hello World"长这样：

```ruby
require 'sinatra'
get '/' do
  '你好，世界'
end
```

把这三行存成 `app.rb`，跑 `ruby app.rb`，浏览器打开 `http://localhost:4567` 就能看到"你好，世界"。**没有项目骨架、没有配置文件、没有目录结构**——这就是 Sinatra 的卖点。

## 为什么重要

不理解 Sinatra，下面这些事都没法解释：

- 为什么 Ruby 社区做"内部工具 / webhook 接收端 / mock server"都偏爱它，而不是 Rails
- 为什么 Express.js / Flask / Hono 这些不同语言的极简框架，路由写法几乎一模一样——都从 Sinatra 抄过来
- 为什么"约定优于配置"和"最少惊讶"是两条相反但同样合理的设计哲学
- 为什么一个 2007 年的小框架，2026 年还在被新项目选用

## 核心要点

Sinatra 的设计可以拆成 **三块**：

1. **DSL 路由**：把 HTTP 动词当成方法名，`get '/path' do ... end` 就是一条路由。类比：像在白板上贴便利贴——左边写"什么请求"，右边写"怎么回答"，一对一对应。

2. **基于 Rack**：Rack 是 Ruby 社区"web 服务器和应用之间的统一接口"，类似 Java 的 Servlet。Sinatra 自己其实就是一个 Rack 应用，所以可以无缝接入任何 Rack 中间件（鉴权 / 日志 / 限流）。

3. **classic vs modular 两种风格**：classic 是上面那种顶层 `get '/'` 写法，一个文件搞定；modular 是 `class MyApp < Sinatra::Base` 把应用包装成类，可以在一个进程里跑多个独立 app。

## 实践案例

### 案例 1：四行代码起一个 JSON API

```ruby
require 'sinatra'
require 'json'
get '/api/users/:id' do
  content_type :json
  { id: params['id'], name: '张三' }.to_json
end
```

**逐部分解释**：

- `:id` 是路径参数，访问 `/api/users/42` 时 `params['id']` 就是 `'42'`
- `content_type :json` 告诉浏览器返回的是 JSON，不是 HTML
- block 最后一行的字符串就是 HTTP body——Ruby 里"最后表达式即返回值"

### 案例 2：mock 第三方 API 给前端联调

```ruby
require 'sinatra'
post '/payment' do
  sleep 1
  status 200
  '{"status":"ok","tx_id":"mock-001"}'
end
```

前端联调时，第三方支付 API 还没接通，用 Sinatra 起一个假端点。`sleep 1` 模拟网络延迟，`status 200` 显式设状态码。**整个文件 5 行**，前端就能照常调试，不用等真接口好。

### 案例 3：在 CLI 工具里嵌入一个状态查询端点

```ruby
class StatusApp < Sinatra::Base
  get '/health' do
    "OK，已处理 #{$counter} 个任务"
  end
end
Thread.new { StatusApp.run! port: 9292 }
```

这是 modular 风格——把 Sinatra 应用包成类，丢到子线程里跑。主程序继续做后台任务，运维想看健康状态就 `curl localhost:9292/health`。**Sinatra 在这里只占 6 行**，不会喧宾夺主。

## 踩过的坑

1. **改代码不自动重载**：classic 风格下编辑路由后，必须 `Ctrl+C` 重启 `ruby app.rb` 才生效。开发时要配合 `rerun` 或 `shotgun` 这类工具，否则会以为"我代码没存上"。

2. **路由的尾斜杠敏感**：`get '/users'` 和 `get '/users/'` 是**两条**不同路由，浏览器地址栏后面多打一个 `/` 就 404，新人常常奇怪为什么 GET 不到。

3. **classic 和 modular 不能混**：一个进程里只能存在一个 classic 应用（顶层 `get/post`）。想跑多个 app 必须全部改成 modular（`class X < Sinatra::Base`），半新半旧会冲突。

4. **没自带 ORM / 表单验证 / 资产打包**：复杂项目要自己拼 Sequel + Tilt + Rack-Protection，很快就变成"自己手写的迷你 Rails"——这时候**该认真考虑直接上 Rails**。

## 适用 vs 不适用场景

**适用**：

- 微服务 / 内部工具 / webhook 接收端——只需要几条路由和 JSON 返回
- mock server / API 原型——临时起一个假后端给前端联调
- 把 web 接口嵌到非 web 项目——例如 CLI 工具暴露 `/health`、`/metrics`
- 教学和 demo——三行代码起一个服务，不需要解释一堆约定

**不适用**：

- 大型业务后台（含用户系统 / 后台管理 / 多模型关系）→ 用 [[rails]] 的约定优于配置
- 异步密集 / 需要 actor 模型 → 用 [[axum]]（Rust）/ [[ktor]]（Kotlin）
- 极致性能场景（金融 / 高频 API）→ Ruby 解释器本身限制了上限，换 [[axum]] 或 Go
- 团队不熟 Ruby——Sinatra 的"少即是多"反而要求开发者懂 Rack 生态，新手反而上手慢

## 历史小故事（可跳过）

- **2007 年**：Blake Mizerany 在 GitHub 开源 Sinatra，名字致敬美国歌手 Frank Sinatra（项目里很多类比和歌名相关）。
- **2008-2009 年**：Heroku 平台早期把 Sinatra 列为头等公民，"几行代码 + git push 上线"成为流行 demo 模式。
- **2010 年**：Express.js（Node）和 Flask（Python）相继发布，路由 DSL 几乎照搬 Sinatra——`app.get('/path', handler)` 就是它的 JavaScript 翻译。
- **2014 年起**：Rails 自己也吸收了"挂载 Rack 应用"的能力，Sinatra 应用可以作为 Rails 的一部分跑——两者从对立变成互补。
- **2020 年代**：Hono / Bun.serve / Cloudflare Workers 这些新框架的最小路由 API 仍然是 Sinatra 这一脉。

## 学到什么

1. **"约定优于配置"和"最少惊讶"是两条平行哲学**——Rails 选前者、Sinatra 选后者，没有谁更对，只看场景
2. **DSL 是把"领域语义"压到代码外观上的技巧**——`get '/path' do ... end` 一眼能看懂，比 `app.add_route(GET, '/path', handler)` 直观
3. **基于通用接口（Rack / WSGI / Servlet）的小框架天然能复用整个生态**——这是它们能用很少代码做很多事的根因
4. **极简框架不等于学得快**——它假设你懂 HTTP 和 Rack，对真新手反而 [[rails]] 这类大框架更友好

## 延伸阅读

- 官方文档：[Sinatra README](https://github.com/sinatra/sinatra/blob/main/README.md)（一页讲完所有特性，10 分钟读完）
- 书：《Sinatra: Up and Running》Alan Harris & Konstantin Haase（O'Reilly，100 页讲透）
- 视频：[RailsConf — Sinatra in 30 minutes](https://www.youtube.com/results?search_query=sinatra+ruby+tutorial)（任选一个入门讲解）
- Rack 规范：[Rack 协议文档](https://github.com/rack/rack)（理解 Sinatra 底层就理解了 Ruby 整个 web 生态）
- [[express]] —— Node.js 里的 Sinatra 翻版
- [[flask]] —— Python 里的 Sinatra 翻版

## 关联

- [[rails]] —— 同语言反面案例：Sinatra 主张最少惊讶，Rails 主张约定优于配置
- [[express]] —— Node 生态的 Sinatra 致敬版，路由 DSL 几乎一致
- [[flask]] —— Python 生态的 Sinatra 致敬版，2010 年发布
- [[hono]] —— 现代 TypeScript 极简框架，仍延续 Sinatra DSL 的路由风格
- [[fastapi]] —— Python 类型驱动的 web 框架，比 Sinatra 多了类型推导和文档生成
- [[axum]] —— Rust 的极简框架，把"路由 = 函数"这件事用类型系统做到了极致
- [[django]] —— Python 大而全的反面对照，类似 Rails 之于 Sinatra

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aspnetcore]] —— ASP.NET Core — 微软跨平台 web 框架
- [[axum]] —— axum — 用 Rust 类型系统当『路由参数表』的 Web 框架
- [[clack]] —— Clack — 给 Common Lisp 加一层标准化的 web 服务器接口
- [[django]] —— Django — 全功能 batteries-included 的 Python web 框架
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[flask]] —— Flask — 用装饰器把 URL 接到函数上的 Python 微框架
- [[grape]] —— Grape — 用 Ruby DSL 专写 REST API 的轻量框架
- [[hanami]] —— Hanami — Ruby 里既不是 Rails 也不是 Sinatra 的第三选择
- [[hono]] —— Hono — 多运行时 Web 框架
- [[ktor]] —— Ktor — 用 Kotlin DSL 拼出来的异步 Web 框架
- [[rails]] —— Ruby on Rails — 约定大于配置的全栈 Web 框架教科书
- [[symfony]] —— Symfony — 把 PHP 框架拆成 30 个独立组件再拼起来

