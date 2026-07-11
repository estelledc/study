---
title: BookStack — 文档型 Wiki
来源: 'https://github.com/BookStackApp/BookStack'
日期: 2026-07-08
分类: editors
难度: 初级
---

## 是什么

BookStack 是一个开源、自托管的团队知识库：它把资料按 **Books / Chapters / Pages** 组织起来，让不会写代码的人也能像写 Word 一样维护文档。

日常类比：它像办公室里一排真正的文件柜。书架放不同主题，书放一类资料，章节把资料分组，页面才是具体内容。

最小例子可以从 API 看出它的模型：你不是去读一堆散文件，而是查询系统里的书。

```bash
curl -H "Authorization: Token $BOOKSTACK_TOKEN_ID:$BOOKSTACK_TOKEN_SECRET" \
  "https://docs.example.com/api/books?count=5"
```

如果返回的是书的列表，就说明 BookStack 把知识当成“可搜索、可授权、可移动的内容对象”，而不是普通 Markdown 文件夹。

它的重点不是做最自由的 Wiki，而是给企业知识库一个低门槛默认形态：WYSIWYG 编辑、全文搜索、权限、版本、附件、图表和企业登录都先内置好。

## 为什么重要

不理解 BookStack，下面这些事会很难解释：

- 为什么很多团队写不出知识库：工具太像代码仓库时，非技术同事不敢改；工具太像聊天时，内容又沉不下来。
- 为什么层级被强约束反而有用：Books / Chapters / Pages 让新人先知道“这页应该放哪”，少一点空白恐惧。
- 为什么自托管仍然有市场：账号、数据库、附件、审计和备份都在自己环境里，适合对数据边界敏感的团队。
- 为什么“好用的编辑器”不是全部：真正的知识库还要管搜索、权限、迁移、备份、身份认证和长期升级。

## 核心要点

1. **固定层级：像把公司资料先分柜再分册**。BookStack 的核心内容是书、章节、页面，外层书架可以把多本书组合展示。这个限制让它不像 Notion 那样随意，但换来更稳定的导航和权限理解。

2. **WYSIWYG 优先：像让所有人都用熟悉的文字处理器**。默认编辑器接近 Word 或 Google Docs，同时保留 Markdown 编辑器给偏技术的用户。它的设计取向很明确：先让普通人能写，再给高手补进阶能力。

3. **自托管平台：像自己维护一间资料室**。BookStack 基于 PHP / Laravel 和 MySQL 或 MariaDB，安装后要自己负责升级、备份、上传目录和登录配置。好处是可控，代价是需要有人懂一点运维。

## 实践案例

### 案例 1：在一台新 Ubuntu 服务器上搭内部知识库

官方安装文档提供 Ubuntu LTS 安装脚本，适合全新机器快速起步。

```bash
wget https://codeberg.org/bookstack/devops/raw/branch/main/scripts/installation-ubuntu-24.04.sh
chmod a+x installation-ubuntu-24.04.sh
sudo ./installation-ubuntu-24.04.sh
```

逐部分解释：

- `wget` 下载官方脚本；它会准备 Apache、MySQL 和 PHP 依赖。
- `chmod a+x` 让脚本可执行；否则系统只会把它当普通文本。
- `sudo` 代表它会改系统级配置，所以官方强调只适合新装系统。

这个案例的真实意义是：BookStack 面向的是“长期跑一个服务”，不是“下载一个桌面编辑器打开文件”。

### 案例 2：用 API 把周会模板写成页面

官方 API 文档说明，创建页面要给出父级 `book_id` 或 `chapter_id`，再提供标题和正文。

```bash
curl --request POST "https://docs.example.com/api/pages" \
  --header "Authorization: Token $BOOKSTACK_TOKEN_ID:$BOOKSTACK_TOKEN_SECRET" \
  --header "Content-Type: application/json" \
  --data '{
    "book_id": 12,
    "name": "本周值班交接",
    "markdown": "## 结论\n\n- 今日无阻塞\n\n## 待跟进\n\n- 检查备份任务"
  }'
```

逐部分解释：

- `book_id: 12` 表示页面放进哪本书；BookStack 的内容一定要挂到清晰位置。
- `markdown` 让脚本直接写入可读文档；也可以传 `html`，但 Markdown 更适合生成模板。
- `Authorization` 用 API token；权限仍跟这个用户在系统里的角色绑定。

这个案例适合把日报、值班记录、发布检查单这类重复文档自动生成出来。

### 案例 3：备份知识库，别只备份上传目录

官方备份文档把数据拆成两类：数据库记录和文件目录，两边都要保留。

```bash
mysqldump -u bookstack -p bookstack > bookstack.backup.sql
tar -czvf bookstack-files-backup.tar.gz .env public/uploads storage/uploads themes
```

恢复时方向相反：

```bash
mysql -u bookstack -p bookstack < bookstack.backup.sql
tar -xvzf bookstack-files-backup.tar.gz
php artisan migrate
```

逐部分解释：

- `mysqldump` 保存页面、用户、权限、修订记录等结构化数据。
- `tar` 保存 `.env`、图片、附件和主题覆盖；只备数据库会丢上传内容。
- `php artisan migrate` 在恢复到新版本后补齐数据库结构变化。

这个案例提醒你：知识库的“内容”不只在页面正文里，也散落在配置、上传文件和数据库表之间。

## 踩过的坑

1. **把书架当成唯一层级**：书架只是组织书的外层视图，真正写内容的地方还是页面。

2. **随便从 WYSIWYG 切到 Markdown**：官方文档提示转换可能丢格式或破坏依赖 HTML 属性的内容。

3. **把安装脚本丢到已有服务器上跑**：脚本会安装和配置 Web、数据库、PHP，可能覆盖现有环境。

4. **只备份数据库不备份 `.env`**：旧 `APP_KEY` 影响多因素认证等加密数据，丢了会让恢复变麻烦。

## 适用 vs 不适用场景

**适用**：

- 团队内部知识库、运维手册、客服 SOP、入职资料，需要普通同事也能编辑。
- 公司想自托管文档，并且能维护 PHP、数据库、反向代理、备份和升级。
- 内容适合按主题沉淀成书、章节、页面，不追求无限自由的块编辑。
- 需要搜索、权限、附件、图表、企业登录和页面修订这些知识库基础能力。

**不适用**：

- 个人离线笔记，尤其是想把 Markdown 文件直接放进 Git 管理的工作流。
- 公开开发者文档站，需要多版本文档、PR 审阅、静态站生成和代码仓库协作。
- 想要大型插件生态或把 Wiki 改造成完全不同业务系统的团队。
- 要求多地域高可用、零停机升级、复杂审批流的重型企业内容平台。

## 历史小故事（可跳过）

- **2015 年**：Dan Brown 因为工作场景里技术水平混杂，又不满意当时方案的价格和易用性，开始做 BookStack。
- **早期**：项目先在自托管社区公开，收到不错反馈；名字和书本层级在最初几个月逐渐定型。
- **2021 年**：BookStack 移出长期 Beta 状态，但项目理念没有大转向，仍然强调稳定和易升级。
- **近年**：官方代码管理重心转到 Codeberg，GitHub 仓库仍保留镜像和星标入口，社区翻译、问题反馈和文档持续推进。
- **现在**：它没有追逐“万能协作平台”，而是坚持做一个简单、可维护、开箱能用的文档型 Wiki。

## 学到什么

- 好知识库不是“页面越自由越好”，而是让新人知道该写在哪、别人能不能找到。
- WYSIWYG 和 Markdown 不是敌人；BookStack 的选择是默认照顾普通用户，同时给技术用户留出口。
- 自托管工具的成本往往在上线之后：升级、备份、权限、登录和恢复演练才是长期功课。
- 强约束产品也有价值：少一点可配置，能换来更低的学习成本和更稳定的维护边界。

## 延伸阅读

- 官方仓库：[BookStackApp/BookStack](https://github.com/BookStackApp/BookStack)
- 官方文档：[BookStack Documentation](https://www.bookstackapp.com/docs/)
- API 文档示例：[BookStack Demo API Docs](https://demo.bookstackapp.com/api/docs)
- 项目 FAQ：[The BookStack Project FAQ](https://www.bookstackapp.com/about/project-faq/)
- [[hedgedoc]] —— 更偏实时协作 Markdown，适合和 BookStack 的结构化知识库对比。
- [[outline]] —— 也是团队知识库，但更偏现代 SaaS 风格和产品化协作体验。

## 关联

- [[markdown-it]] —— BookStack 的 Markdown 编辑能力依赖解析器生态，理解它能看懂“文本到页面”的过程。
- [[codemirror]] —— Markdown 编辑器常用的浏览器代码编辑基础设施。
- [[lexical]] —— BookStack 新编辑器生态相关的富文本框架，可对照 WYSIWYG 的实现方向。
- [[drawio]] —— BookStack 内置 diagrams.net 绘图能力，知识库经常需要流程图和架构图。
- [[hedgedoc]] —— HedgeDoc 解决多人同时写 Markdown，BookStack 更强调整理和沉淀。
- [[outline]] —— 同属团队知识库，适合比较自托管、权限、编辑体验和文档组织方式。
- [[mattermost]] —— 聊天工具适合流动沟通，BookStack 适合把结论沉淀成可搜索文档。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
