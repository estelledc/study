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
        { label: '消化方法论', link: '/method/' },
        { label: '培养计划', link: '/career-plan/' },
        { label: '推荐队列', link: '/queue/' },
        {
          label: '项目研究笔记',
          autogenerate: { directory: 'projects' },
        },
      ],
      customCss: ['./src/styles/custom.css'],
    }),
  ],
});
