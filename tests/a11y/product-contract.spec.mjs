import { expect, test } from '@playwright/test';

const studyUrl = (route) => `/study${route}`;

async function revealSearchResult(dialog, href) {
  const result = dialog.locator(`a[href$="${href}"]`).first();
  for (let page = 0; page < 10 && await result.count() === 0; page += 1) {
    const more = dialog.getByRole('button', { name: 'Load more results' });
    if (!await more.isVisible().catch(() => false)) break;
    const before = await dialog.locator('li').count();
    await more.click();
    await expect.poll(() => dialog.locator('li').count()).toBeGreaterThan(before);
  }
  await expect(result).toBeVisible({ timeout: 10_000 });
}

test('homepage exposes the three CTAs, six themes, and React/ReAct disambiguation', async ({ page }) => {
  await page.goto(studyUrl('/'));
  for (const [name, href] of [
    ['从这里开始', '/study/start/'],
    ['按主题找入口', '/study/topics/'],
    ['看精选队列', '/study/queue/'],
  ]) {
    await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
  }

  await expect(page.locator('a.study-topic-card')).toHaveCount(6);
  await expect(page.locator('a.study-path-card')).toHaveCount(3);
  for (const href of ['/study/topics/frontend/', '/study/topics/ai-agent/', '/study/topics/distributed-systems/']) {
    await expect(page.locator(`a.study-path-card[href="${href}"]`)).toHaveCount(1);
  }
  await expect(page.locator('a.study-note-card[href="/study/projects/react/"] h3')).toHaveText('React');
  await expect(page.locator('a.study-note-card[href="/study/papers/react/"] h3')).toHaveText('ReAct');
});

test('start and both legacy Atlas entrances remain navigable below /study', async ({ page }) => {
  await page.goto(studyUrl('/start/'));
  await expect(page.locator('article.study-path-card')).toHaveCount(3);
  await expect(page.locator('a[href="/study/projects/react/"]')).toBeVisible();
  await expect(page.locator('a[href="/study/papers/react/"]')).toBeVisible();

  for (const area of ['papers', 'projects']) {
    await page.goto(studyUrl(`/${area}-atlas/`));
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator(`main a[href^="/study/atlas/${area}/"]`).first()).toBeVisible();
  }
});

test('Pagefind UI distinguishes the ReAct paper from the React project', async ({ page }) => {
  await page.goto(studyUrl('/'));
  const trigger = page.getByRole('button', { name: '搜索', exact: true });
  await expect(trigger).toBeEnabled();
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: '搜索', exact: true });
  const input = dialog.locator('input[type="search"], input').first();
  await expect(input).toBeVisible();
  await input.fill('ReAct Reasoning Acting');
  const resultStatus = dialog.locator('.pagefind-ui__message');
  await expect(resultStatus).toContainText(/results for ReAct Reasoning Acting/);
  await expect(resultStatus).toHaveAttribute('role', 'status');
  await expect(resultStatus).toHaveAttribute('aria-live', 'polite');
  await expect(resultStatus).toHaveAttribute('aria-atomic', 'true');
  await revealSearchResult(dialog, '/papers/react/');

  await input.fill('React 用写函数描述界面');
  await expect(dialog.getByText(/results for React 用写函数描述界面/)).toBeVisible();
  await revealSearchResult(dialog, '/projects/react/');
});
