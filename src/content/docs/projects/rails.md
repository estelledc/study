---
title: Ruby on Rails — 约定大于配置的全栈 Web 框架教科书
来源: 'https://github.com/rails/rails'
日期: 2026-05-30
分类: backend-framework
难度: 初级
---

## 是什么

Ruby on Rails（**Rails**）是一套**用 Ruby 语言写 Web 应用的全套餐**——从查数据库、渲染页面、处理表单、发邮件到跑后台任务，一次性给你装好。日常类比：像装修房子的"全包套餐"，水电、地板、橱柜、家电一起送，按它的图纸放就行。

口号是 **convention over configuration**（约定大于配置）：你按它定的命名规则起表名和类名，框架就自动把它们接起来，不用写配置文件。

```ruby
class Post < ApplicationRecord
  belongs_to :user
end
```

就这一行——Rails 自动知道你有张 `posts` 表、表里有 `user_id` 列、Post 类能 `.user` 跳到关联用户。**你没写任何配置**。

## 为什么重要

不理解 Rails，下面这些事都没法解释：

- 为什么 GitHub / Shopify / Airbnb / Basecamp / GitLab 这种巨型站点早期都用 Rails 写出来还能撑住流量
- 为什么 Django / Laravel / Phoenix 这一代框架长得跟 Rails 几乎一模一样——它们都是抄 Rails 的"约定 + MVC + ORM"
- 为什么有人写一个新 SaaS 用 Rails 三天就能上线 MVP，但用 Spring Boot 要一周
- 为什么 2026 年了 Rails 还活着——不是因为 Ruby 快，是因为"约定式开发"这套思路本身就对小团队友好

## 核心要点

Rails 的设计可以拆成 **三个支柱**：

1. **约定大于配置（CoC）**：表叫 `users`，类就叫 `User`，主键叫 `id`，外键叫 `user_id`，URL 叫 `/users/:id`。**全部默认对齐**，不用 XML / JSON / YAML 反复声明。类比：宿舍床位按学号排，不用每次问"我睡哪"。

2. **不要重复自己（DRY）**：数据库列名只在迁移文件里写一次，模型类自动读 schema 知道有哪些字段。表单 HTML 不用手写 `<input name="user[email]">`，`form_with model: @user` 自动生成。类比：户口本登记一次，公安、医院、银行都能查到。

3. **MVC 三层 + ActiveRecord 模式**：Model 既是数据（一行）也是查询（一张表的方法），View 是 ERB 模板（HTML 里嵌 Ruby），Controller 接 HTTP 请求拼装数据。`User.where(active: true).includes(:posts)` 这种链式查询是 Rails 的标志。

## 实践案例

### 案例 1：rails new 五分钟生成一个博客

终端敲：

```bash
rails new blog
cd blog
rails generate scaffold Post title:string body:text
rails db:migrate
rails server
```

发生的事：

- `scaffold` 一次性生成数据库迁移文件、Post 模型、PostsController（7 个 action：index/show/new/create/edit/update/destroy）、对应的 ERB 视图模板、路由
- `rails db:migrate` 真的去执行 SQL 建表
- `rails server` 起一个能用浏览器访问的网站，已经能增删改查文章

**没写一行业务代码，CRUD 已经能跑**——这是 Rails 卖点的极端体现。

### 案例 2：ActiveRecord 关联自动查出整棵树

数据库有 users 和 posts 两张表，posts 有 user_id 外键：

```ruby
class User < ApplicationRecord
  has_many :posts
end

class Post < ApplicationRecord
  belongs_to :user
end
```

现在直接用：

```ruby
user = User.find(1)
user.posts          # 自动 SELECT * FROM posts WHERE user_id = 1
user.posts.first.user  # 反向跳回 User
```

**没写 SQL、没写 JOIN、没写 ORM 配置**。`has_many` 这一行声明就让 Rails 给 User 类加了 `.posts` 方法。

### 案例 3：路由约定一行变七个 URL

`config/routes.rb`：

```ruby
Rails.application.routes.draw do
  resources :posts
end
```

这一行 `resources :posts` 等价于：

```
GET    /posts          → index   （列表）
GET    /posts/new      → new     （新建表单页）
POST   /posts          → create  （提交新建）
GET    /posts/:id      → show    （查看）
GET    /posts/:id/edit → edit    （编辑表单）
PATCH  /posts/:id      → update  （提交修改）
DELETE /posts/:id      → destroy （删除）
```

七条 RESTful 路由全部生成。这就是"约定"——你按 REST 那套来命名，就一行搞定。

## 踩过的坑

1. **N+1 查询**：`@posts.each { |p| puts p.user.name }` 模板循环时每条记录单独发一次 SQL 查 user，10 条 = 11 次查库。要写 `Post.includes(:user)` 预加载，不然上线后数据库爆炸。

2. **胖模型反模式**：ActiveRecord 让人把所有逻辑塞 Model 里——验证、回调、状态机、计算、邮件、外部 API 全在 User 类。几年后一个 User 类 3000 行，没人敢动。

3. **callback 雪崩**：`before_save` / `after_create` 钩子链层层触发，删一条数据触发 5 个回调改 8 张表，事务跨多模型，调试时根本不知道哪个钩子先跑。

4. **魔法太多反而难学**：`belongs_to :user` 背后到底加了什么方法、`form_with` 怎么知道字段名、`accepts_nested_attributes_for` 怎么处理嵌套表单——文档不读完很难解释为什么"什么都不写就能跑"。

## 适用 vs 不适用场景

**适用**：
- MVP / SaaS 早期：3-10 人小团队，需要快速迭代有数据库的网站
- 内部管理后台：admin 类应用，CRUD 多于复杂逻辑
- 内容站点 / 博客 / 电商：Shopify 早期就是 Rails，模板渲染 + ActiveRecord 拍合

**不适用**：
- 超高并发实时系统：Ruby 解释器 GIL 限制 + Rails 进程模型重，不如 Go / Rust 的 Axum / Actix
- 微服务 API-only 极简后端：用 Sinatra / Roda 更轻；Rails 全家桶启动慢
- CPU 密集计算：图像处理、机器学习、加密——Ruby 跑得慢
- 嵌入式 / 边缘计算：Rails 进程内存 200MB 起步，不适合资源受限环境

## 历史小故事（可跳过）

- **2003 年**：DHH 在丹麦给 37signals 公司写 Basecamp 项目管理工具，发现把 Web 应用的"水电管线"抽出来能复用
- **2004 年 7 月**：Rails 0.5 开源发布，附带 DHH 那个著名的 15 分钟博客视频，震动整个 web 圈
- **2005 年 2 月**：DHH 才开始接受外部 commit，Rails 开始有真正的社区
- **2006 年**：Apple 把 Rails 放进 macOS Leopard 系统自带，主流认可
- **2010 年代**：Django（Python）、Laravel（PHP）、Phoenix（Elixir）、Spring Boot（Java）全部借鉴"约定大于配置 + ORM + scaffold"。Rails 是这一代框架的精神祖师爷

## 学到什么

1. **约定的力量比配置大**——把"怎么命名"硬性规定下来，能省掉 80% 的脚手架代码
2. **MVC + ORM + scaffold 是 Web 框架的最小三件套**，后来所有后端框架都在这个骨架上长
3. **快速 vs 长期：Rails 让你三天上线，但三年后维护 callback 链可能要三周**——前期免费，后期要还
4. **生产力工具的天花板，是设计者对"重复"的痛苦阈值**——DHH 痛恨重复，所以 DRY 是根命脉

## 延伸阅读

- 视频：[DHH — Rails 创世纪 15 分钟博客](https://www.youtube.com/watch?v=Gzj723LkRJY)（2005 年那个改变 web 开发认知的演示）
- 官方教程：[Rails Guides](https://guides.rubyonrails.org/)（中文社区也有完整翻译，零基础友好）
- 书：《Agile Web Development with Rails》——Rails 创始书，更新到 Rails 7
- 反思：[The Rails Doctrine](https://rubyonrails.org/doctrine)（DHH 亲笔讲 Rails 的九条信念）
- [[django]] —— Python 版的"约定大于配置"近亲

## 关联

- [[django]] —— Python 圈对标 Rails 的全栈框架，几乎抄了同一份 MVC + ORM 思路
- [[express]] —— Node.js 极简反例：什么都不约定，纯路由库，要自己拼
- [[axum]] —— Rust 现代异步路由框架，性能优先但要手动配 ORM / 模板
- [[fastapi]] —— Python 现代 API 框架，用类型注解代替 Rails 的命名约定
- [[spring-boot]] —— Java 圈对应物，约定大于配置 + 自动装配，启动慢但企业级
- [[postgresql]] —— Rails 默认推荐的生产数据库，ActiveRecord 对它支持最好
- [[redis]] —— ActiveJob / Sidekiq 后台任务、Cache、ActionCable 都依赖 Redis

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aspnetcore]] —— ASP.NET Core — 微软跨平台 web 框架
- [[grape]] —— Grape — 用 Ruby DSL 专写 REST API 的轻量框架
- [[hanami]] —— Hanami — Ruby 里既不是 Rails 也不是 Sinatra 的第三选择
- [[laravel]] —— Laravel — 现代 PHP 全栈框架，Eloquent + Blade + Artisan 三件套
- [[phoenix]] —— Phoenix — Elixir/OTP 上的实时 web 框架
- [[sidekiq]] —— Sidekiq — Ruby 后台任务的事实标准
- [[sinatra]] —— Sinatra — 用 Ruby 三行代码起一个 web 服务
- [[symfony]] —— Symfony — 把 PHP 框架拆成 30 个独立组件再拼起来
- [[vips]] —— libvips — 流式低内存图像库
