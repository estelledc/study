---
title: Django — 全功能 batteries-included 的 Python web 框架
来源: 'https://github.com/django/django'
日期: 2026-05-29
分类: backend-api
难度: 中级
---

## 是什么

Django 是一个**写后端时把"常用零件"全配齐的 Python web 框架**——数据库 ORM、后台管理界面、用户认证、表单校验、模板引擎、URL 路由全都自带，你拆开盒子就能用。

日常类比：像买一台已经装好操作系统、装好 office、连好打印机的家用电脑——你坐下来就能干活，不用先去研究主板该插哪根线。同类轻量框架（如 [[flask]]）更像一台只装了主板和电源的裸机，每个零件得你自己挑。

最小例子：定义一个"文章"模型，注册到后台，访问 `/admin` 就有一个能增删改查的界面：

```python
# news/models.py
from django.db import models

class Article(models.Model):
    headline = models.CharField(max_length=200)
    pub_date = models.DateField()

# news/admin.py
from django.contrib import admin
from .models import Article
admin.site.register(Article)
```

3 行代码，得到一个完整的"内容管理系统"。这就是 batteries-included 的具体含义。

## 为什么重要

不理解 Django，下面这些事都没法解释：

- 为什么 Instagram / Pinterest / Disqus 在用户量爆炸的早期能用一个 Python 框架撑下来——Django 把"加缓存、拆数据库、加只读副本"都铺好了路
- 为什么很多公司"内部工具"几天就能上线——直接用 Django Admin 当后台界面，不用自己写
- 为什么"Python 全栈"这个职位真实存在——一个框架管前端模板到数据库迁移
- 为什么新出的 Python 框架（[[fastapi]] / [[flask]]）反而更小——它们是 Django 太大之后的"反作用力"

## 核心要点

Django 的设计可以拆成 **三个核心**：

1. **ORM 把表当成 Python 类**：你写 `Article.objects.filter(pub_date__year=2024)`，Django 翻译成 `SELECT * FROM article WHERE EXTRACT(year FROM pub_date) = 2024`。类比：你说中文，秘书自动翻成 SQL。

2. **MTV 三件套**：Model（数据）/ Template（HTML 模板）/ View（处理逻辑），URL 路由把请求分发到 View，View 查 Model 渲染 Template。类比：餐厅里 model 是冷柜原料、view 是厨师、template 是摆盘模具。

3. **Admin 自动生成后台**：把 model 注册一行，就有一个能搜、能筛、能改的网页后台。类比：宜家家具自带组装好的样品间，让你直接搬进去住。

这三件加起来就是"开箱可用"。其他零件（auth、表单、缓存、迁移）都是这三件的衍生物。

## 实践案例

### 案例 1：用 ORM 查一个作者的所有文章

```python
# 假设有 Reporter 和 Article 两张表，Article.reporter 是外键
from news.models import Reporter, Article

alice = Reporter.objects.get(full_name="Alice")
articles = Article.objects.filter(reporter=alice).order_by("-pub_date")
for a in articles:
    print(a.headline)
```

**逐部分解释**：

- `Reporter.objects` 是 Django 自动生成的查询入口，叫 manager
- `.get(full_name="Alice")` 翻译成 `WHERE full_name = 'Alice'`，返回一个对象
- `.filter(reporter=alice)` 翻译成 `WHERE reporter_id = ?`，返回一个 QuerySet（懒加载，遍历时才发 SQL）
- 整段没写一句 SQL，Django 自动处理参数化和反 SQL 注入

### 案例 2：URL 路由 + View + 模板的完整闭环

```python
# news/urls.py
from django.urls import path
from . import views
urlpatterns = [
    path("articles/<int:year>/", views.year_archive),
]

# news/views.py
from django.shortcuts import render
from .models import Article
def year_archive(request, year):
    a_list = Article.objects.filter(pub_date__year=year)
    return render(request, "news/year_archive.html", {"articles": a_list})
```

```html
<!-- news/templates/news/year_archive.html -->
<h1>{{ year }} 年的文章</h1>
{% for article in articles %}
  <p>{{ article.headline }}</p>
{% endfor %}
```

**怎么连起来**：用户访问 `/articles/2024/` → URL 表匹配到 `year_archive` → view 查数据库 → 把 QuerySet 塞进模板上下文 → 模板循环输出 HTML。

### 案例 3：Admin 自动生成后台 + 字段定制

```python
# news/admin.py
from django.contrib import admin
from .models import Article

@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ("headline", "pub_date", "reporter")
    list_filter = ("pub_date",)
    search_fields = ("headline", "content")
```

跑 `python manage.py createsuperuser` 创个账号，访问 `/admin/` 就有一个能搜文章标题、按日期筛选、点进去改字段的网页后台。**总代码量：上面那 6 行**。这种"零成本搭出能用的内部系统"就是 Django 早期统治内容站点的原因。

## 踩过的坑

1. **N+1 查询陷阱**：模板里 `{% for a in articles %}{{ a.reporter.name }}{% endfor %}` 会对每篇文章发一次 SQL 查 reporter——100 篇文章发 101 次查询。原因：ORM 默认懒加载关联字段。修法：`Article.objects.select_related("reporter")`。

2. **`makemigrations` 和 `migrate` 是两步**：前者生成迁移文件（描述"要改什么"），后者真正改数据库。生产环境忘了第二步会让代码和库 schema 错开，然后查询失败。

3. **settings.py 里 `DEBUG = True` 上线**：这个开关一旦在生产环境为 True，错误页会暴露完整的 traceback、settings 内容、SQL 语句——历史上多次大型数据泄漏从这里开始。原因：Django 把 debug 信息做得太详细，方便开发但生产致命。

4. **mutable default 参数**：在 model 字段写 `default=[]` 或 `default={}` 会让所有实例共享同一个列表/字典——不是 Django 特有，是 Python 函数默认参数的老坑，但在 model 里发作时定位特别困难。修法：用 `default=list` / `default=dict`（传函数而非值）。

## 适用 vs 不适用场景

**适用**：
- 内容驱动的网站（博客、新闻、电商目录）——Admin + ORM 组合是杀手锏
- 需要快速搭"能用的后台"的内部工具——MVP 阶段几小时上线
- 中等流量、关系型数据为主、团队对前端要求不高的项目
- 需要"全套"的初学者——一个文档系统涵盖前后端

**不适用**：
- 极致性能、低延迟 API（每秒万级请求）——用异步框架 [[fastapi]] 或 Go/Rust 后端
- 主要是 SPA + JSON API 的现代前端架构——Django 自带模板用不上，不如用纯 API 框架
- 微服务架构里的小服务——Django 太重，启动 200ms+；用 [[flask]] 或纯 ASGI
- WebSocket 重场景——Django 异步支持后加，原生不如 [[fastapi]] 顺手

## 历史小故事（可跳过）

- **2003 年**：Adrian Holovaty 和 Simon Willison 在 Lawrence Journal-World 报社内部工具组写了第一版——为了在新闻"截稿前 30 分钟"快速上线一个新页面
- **2005 年**：开源发布，名字取自爵士吉他手 Django Reinhardt
- **2008 年**：Django Software Foundation 成立，开始独立运作
- **2010 年代**：Instagram / Pinterest / Disqus / Mozilla 大规模采用，Django 进入"基础设施"地位
- **2019 年**：3.0 版本加入异步视图（async def），向 [[fastapi]] 等新对手学习

至今 80k+ stars，是 Python 生态里最大的 web 框架。

## 学到什么

1. **"开箱即用" vs "灵活拼装"是后端框架的根本分歧**——Django 选了前者，[[flask]] 选了后者，[[fastapi]] 选了"灵活但带类型"
2. **Admin 是 Django 的差异化武器**——其他框架要复刻这个能力都要花数月
3. **ORM 让数据库查询变 Pythonic 但隐藏了 SQL**——简化新手，但 N+1、慢查询、复杂 join 时必须懂底层
4. **历史早 + 大公司背书 + 文档好**，这三件加起来让 Django 长期占据 Python 后端默认选项

## 延伸阅读

- 官方教程：[Django Tutorial 官方 7 章](https://docs.djangoproject.com/en/5.0/intro/tutorial01/)（跟着写完一个投票应用）
- 视频：[Django for Everybody — Charles Severance](https://www.dj4e.com/)（密歇根大学免费课程）
- 书：《Two Scoops of Django》（最佳实践合集，每个 Django 工程师都该翻过）
- 同类对比：[[flask]] / [[fastapi]] / [[express]]（Node.js 的 Django 平替）

## 关联

- [[flask]] —— Django 的极简对照，"自己组装零件"的代表
- [[fastapi]] —— Django 之后出现的现代 Python 框架，强类型 + 异步优先
- [[express]] —— Node.js 生态里同位置的"框架"，但更接近 Flask 的极简风
- [[postgresql]] —— Django 默认推荐的数据库后端，ORM 大部分功能为它优化
- [[sqlite]] —— Django 默认开发数据库，零配置启动用
- [[typeorm]] —— TypeScript 世界里和 Django ORM 思路最像的库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chi]] —— chi — Go 标准库友好的轻量 HTTP router
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[flask]] —— Flask — 用装饰器把 URL 接到函数上的 Python 微框架
- [[label-studio]] —— Label Studio — 文本图像音视频时序通吃的标注王者
- [[laravel]] —— Laravel — 现代 PHP 全栈框架，Eloquent + Blade + Artisan 三件套
- [[litestar]] —— Litestar — 类型驱动的 ASGI 框架（原 Starlite）
- [[phoenix]] —— Phoenix — Elixir/OTP 上的实时 web 框架
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[quart]] —— Quart — Flask 完全 async 移植，API 同源 + ASGI 后端
- [[rails]] —— Ruby on Rails — 约定大于配置的全栈 Web 框架教科书
- [[sanic]] —— Sanic — 性能向 async Python 框架，对标 Node.js 高吞吐
- [[sentry]] —— Sentry — 把崩溃和报错自动收集 + 分组 + 可查询的错误监控平台
- [[sinatra]] —— Sinatra — 用 Ruby 三行代码起一个 web 服务
- [[spring-boot]] —— Spring Boot — 用 Auto-configuration 把 Java 后端从 XML 地狱里救出来的事实标准框架
- [[sqlite]] —— SQLite — 嵌入式 SQL 数据库
- [[starlette]] —— Starlette — FastAPI 底下那台轻量 ASGI 引擎
- [[strawberry]] —— Strawberry — 用 Python 类型注解直接生成 GraphQL schema
- [[zulip]] —— Zulip — 强制 topic 的开源团队聊天（Django + Tornado 长轮询）

