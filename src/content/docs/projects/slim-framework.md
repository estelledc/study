---
title: Slim — PHP 圈最轻的 web 框架，专给小 API 用
来源: 'https://github.com/slimphp/Slim'
日期: 2026-05-30
分类: 后端开发
难度: 初级
---

## 是什么

Slim 是 PHP 生态里的 **micro web 框架**。日常类比：像一辆 KAYAK 折叠自行车——不带后备箱、不带音响、不带空调，只有车架 + 两个轮子，你想加什么自己装。

它只给你两样东西：

- **路由**：URL 进来，分给对应函数处理
- **中间件管道**：请求从外向里穿过一层层"门"，处理完再从里向外穿回，俗称洋葱模型

```php
$app = AppFactory::create();
$app->get('/hello/{name}', function ($req, $res, $args) {
    $res->getBody()->write("hi, {$args['name']}");
    return $res;
});
$app->run();
```

10 行起一个 web 服务。剩下的——数据库、模板、登录——你自己挑装。这种"只给骨架不带肉"的设计就是 micro 的本意。

## 为什么重要

不理解 Slim，下面这些事都没法解释：

- 为什么 PHP 圈不是只有 [[laravel]] / [[symfony]]，还需要一个轻量选项——同一个语言的"小快灵"和"全家桶"得共存
- 为什么 PSR-7 / PSR-15 这两个 PHP 标准会被广泛接受——Slim v4 是第一批真正按它实现的主流框架
- 为什么写 PHP 微服务 / Lambda 函数大家不会拖一个 Laravel 进来——Laravel 启动常到数 MB，短任务不划算
- 为什么 Slim 在 PHP 圈的位置，跟 [[express]] 在 Node 圈、[[fastapi]] 在 Python 圈极其相似

## 核心要点

Slim 的设计可以拆成 **三个支点**：

1. **PSR-7 把 HTTP 消息标准化**：请求是 `Request` 对象、响应是 `Response` 对象，且**不可变**——每次改动都返回新对象。类比：发邮件不能改已发出的，要"撤回重发"。这让中间件之间传递请求时不会互相污染。

2. **PSR-15 中间件栈是洋葱模型**：每个中间件像一层洋葱皮，请求从外向里穿过所有层到达路由处理器，响应再从里向外回。类比：海关安检——进场逐道查、离场逐道盖章。后加的中间件反而最先碰到请求，这一点新人最容易栽。

3. **不绑定 HTTP 实现**：v4 故意不自带 Request / Response 类，要你自己 `composer require` 一个 PSR-7 实现（Nyholm / Guzzle / Slim-Psr7 三选一）。类比：买相机机身不送镜头，逼你按用途选。

三个支点合起来：**HTTP 消息可换 + 中间件可拼 + 路由极简**——给 PHP 留出一个"想要 micro 就拿 Slim"的位置。

## 实践案例

### 案例 1：30 行返回 JSON 的 hello API

先装依赖：`composer require slim/slim slim/psr7`（v4 不自带 PSR-7 实现，缺了会报找不到 ResponseFactory）。

```php
<?php
require 'vendor/autoload.php';

use Slim\Factory\AppFactory;

$app = AppFactory::create();

$app->get('/api/users/{id}', function ($req, $res, $args) {
    $data = ['id' => $args['id'], 'name' => 'Jason'];
    $res->getBody()->write(json_encode($data));
    return $res->withHeader('Content-Type', 'application/json');
});

$app->run();
```

**逐部分解释**：

- `AppFactory::create()` 自动探测装了哪个 PSR-7 实现，挑一个用
- `$app->get(路径, 回调)` 注册路由，回调拿到三个参数：请求、响应、URL 参数
- `$res->withHeader(...)` 返回**新**对象（PSR-7 不可变），所以必须 `return`，否则改动不生效

### 案例 2：自定义认证中间件，看洋葱模型怎么截断请求

```php
$auth = function ($req, $handler) {
    $token = $req->getHeaderLine('Authorization');
    if ($token !== 'Bearer secret') {
        $res = new \Slim\Psr7\Response();
        return $res->withStatus(401);
    }
    return $handler->handle($req);
};

$app->add($auth);
```

**逐部分解释**：

- 中间件签名固定：`($request, $handler) => Response`
- 想放行：调 `$handler->handle($req)`，请求继续往里穿
- 想截断：直接 `return` 一个新响应，后面所有中间件 + 路由都不会执行
- `$app->add(...)` 把中间件压栈——**后加的先执行**，所以鉴权这种"门口检查"必须最后 add

### 案例 3：接 PHP-DI 容器注入数据库连接

```php
use DI\Container;

$container = new Container();
$container->set('db', fn() => new PDO('sqlite:app.db'));

AppFactory::setContainer($container);
$app = AppFactory::create();

$app->get('/users', function ($req, $res) {
    $db = $this->get('db');
    $rows = $db->query('SELECT * FROM users')->fetchAll();
    $res->getBody()->write(json_encode($rows));
    return $res->withHeader('Content-Type', 'application/json');
});
```

回调里用 `$this->get('db')` 拿容器里登记的对象，不必每次 `new PDO`。这就是 PSR-11 容器接口的标准用法。

## 踩过的坑

1. **必须手选 PSR-7 实现**：v4 不自带 HTTP 消息类，第一次 `composer require slim/slim` 完跑起来会报"找不到 ResponseFactory"，必须再装 `slim/psr7` 或 `nyholm/psr7` 才行。
2. **中间件顺序反直觉**：`add()` 是栈结构，**后加的先执行**。新人常把鉴权写最后导致先跑 CORS 再鉴权，业务路径已经被处理了一半才检查 token。
3. **依赖注入容器要自己接**：Slim 只接受 PSR-11 接口，没装 PHP-DI / League Container 时回调里 `$this->get(...)` 直接报错。
4. **prod 模式错误不显示堆栈**：正确写法是 `$app->addErrorMiddleware(false, false, false)`，三个参数依次是 displayErrorDetails / logErrors / logErrorDetails。开发期忘记把第一个改成 `true`，会看到一片白屏完全不知道哪里炸了。

## 适用 vs 不适用场景

**适用**：

- 写小型 RESTful API / JSON 接口（10-50 个路由）
- PHP 微服务、Serverless 函数（Slim 启动常在数百 KB 级，Laravel 常到数 MB，短任务差一截）
- 渐进式接入 PSR 标准的老项目——Slim 不绑你的其余技术栈
- 需要精细控制中间件管道顺序的场景（鉴权 / 限流 / 日志）

**不适用**：

- 需要 ORM / 队列 / 缓存 / 表单 / 邮件 等全家桶 → 选 [[laravel]]
- 需要企业级 DI 容器 + 大量约定 → 选 [[symfony]]
- 模板渲染密集的传统 web 应用（论坛、CMS）→ 选 Laravel / Symfony
- 团队没人懂 PSR 标准，需要框架"手把手"约束写法 → Slim 太自由反而是坑

## 历史小故事（可跳过）

- **2010 年**：Josh Lockhart 仿照 Ruby 的 Sinatra 写了第一版 Slim。目标：给 PHP 一个真正轻量的 web 内核，对抗当时已经开始臃肿的 Zend / CakePHP。
- **2012-2018 年**：Slim v3 用自家的 HTTP 实现，配合 Pimple 容器，是 PHP 圈写小 API 的常用选项。
- **2019 年**：Slim v4 大改——彻底拥抱 PSR-7 / PSR-15 标准，把 HTTP 实现解耦成可插拔，把容器解耦成 PSR-11 接口。
- **2026 年至今**：v4.15.x 维持稳定，PHP 8.x 兼容，是 PHP 微服务 + Lambda 场景的事实标准。

## 学到什么

1. **micro 框架 = 显式拼装**：少给默认值反而让你更清楚每一块是什么，对学习很友好
2. **PSR 标准让生态可拼**——符合 PSR-15 的中间件可跨框架复用；Laravel / Symfony 也逐步对齐，但并非所有自有中间件都能即插即用
3. **洋葱模型是 web 框架的核心抽象**：理解了它，Express / Koa / Fastify / Slim 一通百通
4. **不可变请求 / 响应对象** 强制函数式风格，避免中间件之间互相改坏对方的状态

## 延伸阅读

- 官方文档：[Slim 4 Documentation](https://www.slimframework.com/docs/v4/)（结构清晰，从 hello world 到中间件全覆盖）
- PSR-7 标准：[PSR-7 HTTP Message Interface](https://www.php-fig.org/psr/psr-7/)（理解 Slim 的根基）
- PSR-15 标准：[PSR-15 HTTP Server Request Handlers](https://www.php-fig.org/psr/psr-15/)（中间件签名为什么长那样）
- 视频：[PHP 微框架对比 Slim vs Lumen vs Mezzio](https://www.youtube.com/results?search_query=slim+framework+vs+lumen)（10 分钟看清边界）
- [[express]] —— Node 圈最像 Slim 的对应物
- [[fastapi]] —— Python 圈的轻量 API 选择，思路相似但加了类型驱动

## 关联

- [[express]] —— Node 圈的同位选项，洋葱模型的设计完全一致
- [[laravel]] —— PHP 全家桶代表，和 Slim 是"全 vs 微"的对照组
- [[symfony]] —— PHP 企业级选择，Slim 的反面：约定多 vs 约定少
- [[fastapi]] —— Python 圈的轻量 API，PSR-7 思路对应 Pydantic 类型化请求
- [[axum]] —— Rust 的 Tower middleware 也是洋葱模型，跨语言印证此抽象
- [[warp]] —— Rust 的 Filter 风格 web 框架，组合性思路类似 Slim 中间件栈
- [[actix-web]] —— Rust 同生态另一选项，对比之下 Slim 性能弱但开发体验更直白

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
