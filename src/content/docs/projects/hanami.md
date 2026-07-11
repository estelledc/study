---
title: Hanami — Ruby 里既不是 Rails 也不是 Sinatra 的第三选择
来源: 'https://github.com/hanami/hanami'
日期: 2026-05-30
分类: backend-framework
难度: 中级
---

## 是什么

Hanami 是一个用 **Ruby** 写的模块化全栈 web 框架。日常类比：如果 [[rails]] 像一辆出厂就装好所有配件的整车——开门就能开，但你想换发动机得拆半车；[[sinatra]] 像一堆散件——零件全在地上，自己拼；那 Hanami 像**一辆模块化电动车**：底盘 / 电池 / 座舱都是独立模块，可以单独换，但出厂时已经组合成能跑的车。

最小例子（Hanami 2.x）：

```ruby
# config/routes.rb
module Demo
  class Routes < Hanami::Routes
    get '/', to: 'home.show'
  end
end

# app/actions/home/show.rb
module Demo
  module Actions
    module Home
      class Show < Demo::Action
        def handle(*, response)
          response.body = '你好'
        end
      end
    end
  end
end
```

比 Sinatra 的"三行 hello world"啰嗦得多，但**每个文件做的事情边界清晰**——这就是 Hanami 的卖点。

## 为什么重要

不理解 Hanami，下面这些事都没法解释：

- 为什么 Ruby 社区有人搞了一个不像 Rails 也不像 Sinatra 的框架，而且能活十年还在更新
- 为什么"依赖注入"（DI）这个 Java/.NET 圈的老概念，会被 Ruby 拿来重新发明
- 为什么大型 Rails 项目最后都长成"一坨"，而 Hanami 想用 slice 提前切开
- 为什么 dry-rb 这套库能影响整个 Ruby 函数式风格——Hanami 是它最大的宿主

## 核心要点

Hanami 的设计可以拆成 **三块**：

1. **应用即容器（Hanami::App）**：整个应用是一个 DI 容器（dependency injection container），所有类自动注册成可注入的依赖。类比：像一个零件仓库，谁要用 `repos.user_repo`，写一句 `include Deps['repos.user_repo']` 就自动从仓库领出来，不用 `new` 也不用全局变量。

2. **slice（切片）**：把应用切成多个子模块，每个 slice 是独立命名空间 + 独立容器。类比：像把大公司拆成事业部，每个部门有自己的人事和财务，跨部门要走流程申请。

3. **dry-rb 生态契约**：表单校验用 `dry-validation`、错误处理用 `dry-monads`（Result/Maybe）、配置用 `dry-system`。类比：像给 Ruby 装上一套"可选的静态类型护具"——你不写就跟普通 Ruby 一样动态，写了就有编译期级别的契约保护。

## 实践案例

### 案例 1：Action（控制器）里用 Deps 注入数据层

```ruby
module Demo
  module Actions
    module Articles
      class Show < Demo::Action
        include Deps['repos.article_repo']

        def handle(request, response)
          article = article_repo.find(request.params[:id])
          response.body = article.title
        end
      end
    end
  end
end
```

**逐部分解释**：

- `include Deps['repos.article_repo']` 是 Hanami 的注入语法——它从容器里把 `ArticleRepo` 拿出来，挂成实例方法 `article_repo`
- 没有 `@article_repo = ArticleRepo.new`，也没有全局单例，**测试时可以一行 stub 掉**
- `handle(request, response)` 是 Hanami action 的固定入口，Rails 用 `def show; end` 那种约定方法名，Hanami 选择显式

### 案例 2：用 slice 把 admin 后台切出来

```ruby
# config/slices/admin.rb
module Admin
  class Slice < Hanami::Slice
  end
end
# slices/admin/actions/dashboard/show.rb
module Admin
  module Actions
    module Dashboard
      class Show < Admin::Action
        def handle(*, response)
          response.body = '管理后台'
        end
      end
    end
  end
end
```

把后台代码全放在 `slices/admin/`，**它有自己的命名空间、自己的容器、自己的路由前缀**。主应用看不见 admin 的内部细节，反过来也一样。Rails 里 admin 通常是 `Admin::DashboardController`，但所有代码挤在同一个 autoload 树——slice 把"物理隔离"提前到目录层。

### 案例 3：用 dry-validation 校验请求参数

```ruby
class CreateUserContract < Dry::Validation::Contract
  params do
    required(:email).filled(:string)
    required(:age).filled(:integer)
  end
  rule(:age) { key.failure('必须 ≥ 18') if value < 18 }
end
```

在 action 里 `CreateUserContract.new.call(params)` 拿到一个 Result 对象——成功就 `.to_h` 取出干净参数，失败就 `.errors.to_h` 拿到错误字段。**校验和业务逻辑分文件**，比 Rails 的 strong_params + ActiveModel validation 更解耦。

## 踩过的坑

1. **2.x 和 1.x 几乎是两个框架**：搜中文教程八成是 1.x 的（"controller / view 文件夹结构"），在 2.x 里完全跑不通。版本号一定看清，认准 `hanami (~> 2.0)`。

2. **Deps 注入的 key 不好追踪**：`Deps['repos.user_repo']` 字符串 key 让 IDE 跳转失败、栈追踪难读。新人会被"这个字符串到底对应哪个文件"卡很久——答案在容器配置里靠目录约定。

3. **slice 之间默认互相隔离**：跨 slice 调用必须在 config 里显式 `import`，强行 `require` 会报命名空间冲突。新人常常以为"反正都是 Ruby 类，互相用一下没事"，结果在 slice 边界上撞墙。

4. **社区比 Rails 小一个数量级**：Stack Overflow 搜不到答案是常态，得直接看源码或去 Hanami Discord 问。这个心理预期一定要先建好，不然会反复被"为什么没人遇到过这个 bug"折磨。

## 适用 vs 不适用场景

**适用**：

- 中大型 Ruby 应用想要"模块化 / DDD-friendly"——slice 提前切边界
- 团队里有人懂依赖注入 / 函数式风格，想用 dry-monads / dry-validation 的契约层
- 已被"巨型 Rails 项目"折磨过，下一个项目想从一开始就拆开
- 业务子域多（电商：订单 / 商品 / 用户分别独立演化）

**不适用**：

- 小型项目 / MVP / 内部工具——直接 [[sinatra]] 几行搞定，Hanami 的脚手架重得不值
- 团队完全没碰过 DI / dry-rb——学习曲线陡，比 [[rails]] 慢 3 倍上手
- 需要海量第三方 gem 集成（支付 / 短信 / 推送）——Rails 生态适配最齐
- 极致性能场景——和 Rails 一样吃 Ruby 解释器上限，输给 [[axum]] / [[ktor]]

## 历史小故事（可跳过）

- **2014 年**：波兰开发者 Luca Guidi 发布 Lotus，主张"Ruby 也能写 DDD"，刻意挑衅 Rails 单一架构。
- **2016 年**：Lotus 改名 Hanami（日语"花"），避开商标问题，logo 是樱花。
- **2018-2021 年**：1.x 系列稳定但用户少，被嘲"Rails 没人换、Sinatra 够用"，Hanami 卡在中间地带。
- **2022 年**：Hanami 2.0 大改——抛弃 1.x 自有架构，全面拥抱 dry-rb，引入 slice + DI 容器，定位重新清晰。
- **2025 年**：Hanami / dry-rb / ROM 三家合并成 Hanakai 联合体，资源整合成一个生态。

## 学到什么

1. **"约定优于配置"不是唯一答案**——Hanami 选显式 + 模块化，证明 Ruby 不一定非走 Rails 路线
2. **依赖注入不是 Java 专利**——Ruby 元编程让 DI 写起来比 Spring 简洁，但代价是 IDE 不友好
3. **生态规模决定上手成本**——技术再先进，社区小一个数量级就意味着踩坑没人接得住
4. **大改版本是双刃剑**——Hanami 2.x 让框架重新有竞争力，但同时让 1.x 用户的资料库瞬间作废

## 延伸阅读

- 官方文档：[Hanami Guides](https://guides.hanamirb.org/)（2.x 文档，从零搭一个 app）
- 视频：[Hanami 2.0 announcement by Tim Riley](https://www.youtube.com/results?search_query=hanami+2.0+ruby)（核心维护者讲设计动机）
- 书：《Test Prescriptions》Noel Rappin（讲 Ruby DI 测试模式，对理解 Hanami 帮助大）
- dry-rb 官方：[dry-rb.org](https://dry-rb.org/)（理解 Hanami 底层契约层的入口）
- [[sinatra]] —— Ruby 极简框架，Hanami 的另一极
- [[rails]] —— Ruby 大而全框架，Hanami 想替代或共存的主要对象

## 关联

- [[rails]] —— Ruby 同语言全栈对照，Hanami 选模块化反 Rails 的"约定打包"
- [[sinatra]] —— Ruby 极简对照，Hanami 比它重但比 Rails 轻，定位在中间
- [[axum]] —— Rust 里类似的"模块化 + 类型驱动"框架，思路一脉相承
- [[ktor]] —— Kotlin 里的同类极简模块化框架，对照看会发现 Hanami 多了 DI 容器
- [[quarkus]] —— Java 云原生框架，同样把 DI 容器作为应用主干
- [[spring-boot]] —— DI 容器的鼻祖代表，Hanami 的 Hanami::App 借了它的核心思想
- [[fastapi]] —— Python 类型驱动框架，Hanami 的 dry-validation 思路与之共振

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clack]] —— Clack — 给 Common Lisp 加一层标准化的 web 服务器接口
- [[grape]] —— Grape — 用 Ruby DSL 专写 REST API 的轻量框架
- [[symfony]] —— Symfony — 把 PHP 框架拆成 30 个独立组件再拼起来
