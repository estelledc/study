import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import remarkWikilinks from './scripts/remark-wikilinks.mjs';

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
      description: '通过研究 GitHub 开源项目持续学习——AI 时代产品工程师培养路线',
      defaultLocale: 'root',
      locales: {
        root: { label: '简体中文', lang: 'zh-CN' },
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/estelledc/study' },
      ],
      expressiveCode: {
        shiki: {
          langAlias: Object.fromEntries(textOnlyCodeFenceLanguages.map((lang) => [lang, 'txt'])),
        },
      },
      // Sidebar 是骨架，不放 100+ 笔记的扁平列表。
      // 笔记发现走 papers-atlas / projects-atlas（多维索引，scripts/regen-atlas.mjs 自动生成）
      // + 顶部 Pagefind 搜索（Cmd-K）+ 笔记尾部 [[backlink]]。
      sidebar: [
        { label: '主页', link: '/' },
        { label: '立场宣言', link: '/about/' },
        { label: '培养计划', link: '/career-plan/' },
        {
          label: '项目研究',
          items: [
            { label: '项目消化方法论', link: '/method/' },
            { label: '项目推荐队列', link: '/queue/' },
            { label: '项目全景索引', link: '/projects-atlas/' },
          ],
        },
        {
          label: '论文研究',
          items: [
            { label: '论文消化方法论', link: '/papers-method/' },
            { label: '论文推荐队列', link: '/papers-queue/' },
            { label: '论文全景索引', link: '/papers-atlas/' },
          ],
        },
      ],
      customCss: [
        './src/styles/jx/tokens.css',
        './src/styles/jx/base.css',
        './src/styles/jx/components.css',
        './src/styles/custom.css',
        './src/styles/opendesign-theme.css',
      ],
    }),
  ],
});
