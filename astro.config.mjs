import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import remarkWikilinks from './scripts/remark-wikilinks.mjs';

const studyStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: "Jason's Study",
  alternateName: 'Jason 的工程学习地图',
  url: 'https://estelledc.github.io/study/',
  description: '给零基础工程师的开源项目与论文学习地图，从真实项目和经典论文里建立工程判断力。',
  inLanguage: ['zh-CN', 'en'],
  author: {
    '@type': 'Person',
    '@id': 'https://estelledc.github.io/#person',
    name: 'Jason Xun',
    url: 'https://estelledc.github.io/',
    sameAs: ['https://github.com/estelledc'],
  },
};

const textOnlyCodeFenceLanguages = [
  'agda',
  'algol',
  'aql',
  'bnf',
  'caddyfile',
  'capnp',
  'cfg',
  'conf',
  'cuda',
  'dafny',
  'earthfile',
  'edgeql',
  'env',
  'flux',
  'fstar',
  'granule',
  'idris',
  'isar',
  'lambda',
  'logql',
  'ml',
  'mlir',
  'ngql',
  'nuprl',
  'org',
  'p4',
  'promela',
  'promql',
  'pseudo',
  'self',
  'sml',
  'smt2',
  'smv',
  'thrift',
  'tla',
  'traceql',
  'xonsh',
  'yacc',
];

export default defineConfig({
  site: 'https://estelledc.github.io',
  base: '/study',
  markdown: {
    remarkPlugins: [remarkWikilinks],
  },
  integrations: [
    starlight({
      title: "Jason's Study",
      description: '给零基础工程师的开源项目与论文学习地图',
      defaultLocale: 'root',
      locales: {
        root: { label: '简体中文', lang: 'zh-CN' },
      },
      disable404Route: true,
      head: [
        { tag: 'meta', attrs: { name: 'theme-color', content: '#faf6f0' } },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: 'https://estelledc.github.io/study/og-study.webp',
          },
        },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image:alt',
            content: "Jason's Study — 从真实项目和经典论文里建立工程判断力",
          },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'twitter:image',
            content: 'https://estelledc.github.io/study/og-study.webp',
          },
        },
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: JSON.stringify(studyStructuredData),
        },
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/estelledc/study' },
      ],
      expressiveCode: {
        shiki: {
          langAlias: Object.fromEntries(textOnlyCodeFenceLanguages.map((lang) => [lang, 'txt'])),
        },
      },
      components: {
        PageTitle: './src/components/PageTitle.astro',
        Search: './src/components/Search.astro',
        Header: './src/components/StudyHeader.astro',
        MobileMenuFooter: './src/components/StudyMobileMenuFooter.astro',
      },
      // Sidebar 是骨架，不放 100+ 笔记的扁平列表。
      // 笔记发现走 papers-atlas / projects-atlas（多维索引，scripts/regen-atlas.mjs 自动生成）
      // + 顶部 Pagefind 搜索（Cmd-K）+ 笔记尾部 [[backlink]]。
      sidebar: [
        { label: '主页', link: '/' },
        { label: '从这里开始', link: '/start/' },
        {
          label: '学习路径',
          items: [
            { label: '主题总览', link: '/topics/' },
            { label: '前端与全栈', link: '/topics/frontend/' },
            { label: 'AI Agent 与 LLM 系统', link: '/topics/ai-agent/' },
            { label: '数据库', link: '/topics/database/' },
            { label: '分布式系统', link: '/topics/distributed-systems/' },
            { label: '编程语言与类型系统', link: '/topics/pl-type-systems/' },
            { label: '基础设施', link: '/topics/infrastructure/' },
          ],
        },
        {
          label: '精选与索引',
          items: [
            { label: '项目精选队列', link: '/queue/' },
            { label: '论文精选队列', link: '/papers-queue/' },
            { label: '项目全景索引', link: '/projects-atlas/' },
            { label: '论文全景索引', link: '/papers-atlas/' },
          ],
        },
        {
          label: '方法论',
          items: [
            { label: '怎么消化一个 GitHub 项目', link: '/method/' },
            { label: '怎么消化一篇论文', link: '/papers-method/' },
            { label: '立场宣言', link: '/about/' },
            { label: '培养计划', link: '/career-plan/' },
          ],
        },
        {
          label: 'Research 标杆',
          items: [
            { label: '14 类研究总览', link: '/research/' },
            { label: '零基础学习地图', link: '/research/research-refresh-program/beginner-learning-map/' },
            { label: '完成性矩阵', link: '/research/research-refresh-program/coverage-matrix/' },
          ],
        },
      ],
      customCss: [
        './src/styles/jx/tokens.css',
        './src/styles/jx/base.css',
        './src/styles/jx/components.css',
        './src/styles/jx/product-ui.css',
        './src/styles/custom.css',
        './src/styles/opendesign-theme.css',
      ],
    }),
  ],
});
