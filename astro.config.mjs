import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://estelledc.github.io',
  base: '/study',
  integrations: [
    starlight({
      title: "Jason's Study",
      description: '通过研究 GitHub 开源项目持续学习——AI 时代产品工程师培养路线',
      defaultLocale: 'root',
      locales: {
        root: { label: '简体中文', lang: 'zh-CN' },
      },
      social: {
        github: 'https://github.com/estelledc/study',
      },
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
            {
              label: '项目笔记',
              autogenerate: { directory: 'projects' },
            },
          ],
        },
        {
          label: '论文研究',
          items: [
            { label: '论文消化方法论', link: '/papers-method/' },
            { label: '论文推荐队列', link: '/papers-queue/' },
            { label: '论文全景索引', link: '/papers-atlas/' },
            {
              label: '论文笔记',
              autogenerate: { directory: 'papers' },
            },
          ],
        },
      ],
      customCss: ['./src/styles/custom.css'],
    }),
  ],
});
