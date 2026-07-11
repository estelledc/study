---
title: Clack — 给 Common Lisp 加一层标准化的 web 服务器接口
来源: 'https://github.com/fukamachi/clack'
日期: 2026-05-30
分类: projects / Web 框架
难度: 中级
---

## 是什么

Clack 是 Eitaro Fukamachi 2011 年开源的 **Common Lisp web 应用环境**。日常类比：像电源插座的国标——不管你买的是苹果充电器还是华为充电器，墙上插孔都长一样。Clack 就是 Common Lisp 世界给 web 服务器和 web 应用之间约定的那个"国标插孔"。

它的灵感直接来自 Ruby 的 Rack 和 Python 的 WSGI：

```lisp
(clack:clackup
  (lambda (env)
    (declare (ignore env))
    '(200 (:content-type "text/plain") ("Hello, Clack!"))))
```

一个 Clack 应用就是一个普通 lambda：吃 `env`（请求信息），吐 `(状态码 头部 正文)` 三元组。Hunchentoot / Woo / Wookie 各家服务器只要支持 Clack 协议，这个 lambda 就能不改一个字直接跑。

## 为什么重要

不理解 Clack，下面这些问题没法解释：

- 为什么 Common Lisp 写 web 应用，换服务器后端不用重写代码
- 为什么 Caveman2 / Ningle / Lucerne 这些"框架"看起来都长得很像——它们底下都是 Clack
- 为什么 Lisp 圈推荐"先选 Clack，再挑后端"，而不是直接选 Hunchentoot
- 为什么 [[sinatra]] / [[express]] 这些跨语言的微框架都隐含一个 server-app 解耦层

## 核心要点

Clack 的设计可以拆成 **三块**：

1. **应用是函数**：一个应用 = `(lambda (env) ...)`。`env` 是 plist（属性列表），里面装 `:request-method` `:path-info` `:query-string` `:headers` 等字段。返回值固定是 `(status headers body)` 三元组。

2. **中间件是函数的函数**：中间件 = 接收一个 app 返回新 app 的高阶函数。日常类比：俄罗斯套娃，每一层在请求进来时做一件事（记日志、加鉴权、压缩），传给下一层；响应出去时反向走一遍。

3. **clackup 是粘合剂**：`clack:clackup` 把 app 和后端服务器粘到一起。`:server :woo` 切成 Woo，`:server :hunchentoot` 切成 Hunchentoot，应用代码完全不动。

三块加起来叫 **Clack 协议**，2015 年前后被拆成更小的 Lack 核心 + Clack 启动器两层。

## 实践案例

### 案例 1：最小 Hello World

```lisp
(ql:quickload :clack)

(defvar *handler*
  (clack:clackup
    (lambda (env)
      (declare (ignore env))
      '(200 (:content-type "text/plain") ("Hello, Clack!")))))
```

打开 `http://localhost:5000` 就能看到。停服务用 `(clack:stop *handler*)`。这个例子里没有路由、没有模板、什么都没有——这正是 Clack 的卖点：**最小可运行 web 应用 5 行**。

### 案例 2：用中间件搭日志 + 静态文件

```lisp
(clack:clackup
  (lack:builder
    :accesslog
    (:static :path "/public/" :root #P"./static/")
    *app*))
```

`lack:builder` 把多个中间件和最终 app 串起来。请求先过 `:accesslog`（记访问日志）→ `:static`（命中静态文件就直接返回）→ `*app*`（业务逻辑）。响应反向走一遍。

中间件本质就是函数包装：

```lisp
(defun wrap-log (app)
  (lambda (env)
    (format t "~A ~A~%" (getf env :request-method) (getf env :path-info))
    (funcall app env)))
```

接收 `app` 返回新 app——这种"中间件栈"模式和 Express / Koa / Django 一模一样。

### 案例 3：换后端不改代码

```lisp
;; 开发时用 Hunchentoot，调试方便
(clack:clackup *app* :server :hunchentoot :port 8080)

;; 上线时换 Woo（基于 libev，吞吐高 5-10 倍）
(clack:clackup *app* :server :woo :port 80 :address "0.0.0.0")
```

应用代码 `*app*` **零改动**。这就是『标准化插孔』的实际收益——开发用方便的，上线用快的。

后端选择速查：

- **Hunchentoot**：CL 圈最老牌，文档全，单线程模型简单，适合学习和中等流量
- **Woo**：Fukamachi 自己写的，基于 libev 异步，吞吐高 5-10 倍，生产首选
- **Wookie / Toot**：相对小众，特殊场景才考虑

## 踩过的坑

1. **body 必须是 list / pathname / stream**：返回 `"Hello"`（字符串）会被当成字符 list 输出乱码。要写 `("Hello")` 或 `(list "Hello")`。

2. **environment 是 plist 不是 hash-table**：取值用 `(getf env :request-method)`，写成 `gethash` 直接挂掉。这点对从 Python WSGI 转过来的人最反直觉。

3. **中间件顺序栈式生效**：`:builder` 里写在最外面的中间件**最先**处理请求、**最后**处理响应。鉴权要写在静态文件**前面**（外面），否则静态文件会绕过鉴权。

4. **clackup 默认阻塞 REPL**：直接调用会卡住交互式开发。要么传 `:use-thread t`，要么用 `bordeaux-threads:make-thread` 丢到独立线程，否则你以为服务起来了实际上 REPL 死锁。

## 适用 vs 不适用场景

**适用**：
- Common Lisp 写 web 后端、API 服务、内网工具
- 想要"先开发再优化"——开发用 Hunchentoot，上线切 Woo
- 学 Common Lisp 生态的入口——Caveman2 / Ningle / Mito 都建在它上面

**不适用**：
- 不写 Common Lisp 的人——这是 CL 专属基建，跨语言学价值有限
- 需要完整 MVC 框架的项目——Clack 只是协议层，要 ORM / 模板 / 路由得叠 Caveman2
- 实时双向通信为主的应用——WebSocket 支持靠后端实现差异大，不如直接选 Woo + websocket-driver

## 历史小故事（可跳过）

- **2011 年**：Eitaro Fukamachi 看到 Ruby Rack 把 web server 抽象掉的好处，决定给 Common Lisp 做一份，命名 Clack（"Common Lisp Rack"的缩写）。
- **2013-2014 年**：Clack v1 时代——把所有功能（中间件、构建器、应用基类）塞在一个包里，包很大。
- **2015 年前后**：重构出 Lack 作为更小的核心协议层，Clack 退化为"启动器 + 兼容层"。一个项目通常依赖两个名字。
- **2017 年至今**：Caveman2、Ningle、Lucerne 这些 CL web 框架默认依赖 Clack/Lack；Woo（Fukamachi 自己写的高性能后端）成为生产首选。

## 学到什么

1. **协议优先于实现**：先定义 server↔app 接口，再让 N 家服务器都来实现。这是 Rack / WSGI / Clack / [[koa]] 的共同模式。
2. **应用即函数 + 中间件即高阶函数**：函数式语言天生适合做这套抽象，CL 用 lambda 比 Ruby 用 Proc 更直接。
3. **小核心 + 周边生态**：Clack/Lack 自己很小（几千行），所有"框架感"由 Caveman2 等上层提供。这是 Unix 风格的 web 抽象设计。
4. **类比迁移**：理解了 Rack/WSGI 之后再看 Clack，五分钟就能上手——好的设计模式跨语言通用。

## 延伸阅读

- 文档站：[Clack official docs](https://clacklisp.org/) —— 含中间件清单和后端对比表
- 作者博客：[Fukamachi 的 Lisp 系列](http://fukamachi.hatenablog.com/) —— Clack/Woo/Caveman2 设计动机
- 同款项目：[[sinatra]] —— Ruby 的微 web 框架，理念与 Clack 上层 Ningle 一致
- 同款抽象：[[express]] —— Node.js 的 Connect/Express 也是「app + 中间件栈」
- Python 对照：[[flask]] —— WSGI app + 装饰器路由的最小组合

## 关联

- [[sinatra]] —— Ruby 的 Sinatra 是 Ningle/Lucerne 的灵感，Clack 是它们的底层
- [[express]] —— Express 的 `app.use(mw)` 等价于 `lack:builder`
- [[koa]] —— Koa 的洋葱模型中间件，和 Clack 中间件栈是同一个概念
- [[flask]] —— Flask 跑在 WSGI 上，Clack 跑在自己的协议上，地位一致
- [[django]] —— Django 也是 WSGI app，Clack 等价物在 CL 圈是 Caveman2
- [[fastapi]] —— FastAPI 走 ASGI（异步版 WSGI），Clack 暂没等价异步协议
- [[hanami]] —— Hanami 是 Ruby 框架，底下还是 Rack——和 Caveman2/Clack 同构

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boxen]] —— boxen — 给终端文本套个边框的事
- [[enquirer]] —— enquirer — 让 CLI 工具会问问题的轻量库
- [[ora]] —— ora — 终端 spinner 用 ANSI 反复擦写同一行
- [[textual]] —— Textual — 用 CSS 写终端界面的 Python 框架
- [[yargs]] —— yargs — Node.js 命令行参数解析的事实标准
