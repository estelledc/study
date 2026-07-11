import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const representativeRoutes = [
  '/',
  '/start/',
  '/topics/ai-agent/',
  '/topics/frontend/',
  '/topics/database/',
  '/topics/distributed-systems/',
  '/topics/infrastructure/',
  '/topics/pl-type-systems/',
  '/papers-atlas/',
  '/projects-atlas/',
  '/projects/react/',
  '/papers/react/',
];

const studyUrl = (route) => `/study${route}`;

async function layoutSnapshot(page) {
  return page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    badCodeBlocks: [...document.querySelectorAll('pre')]
      .filter((element) => element.scrollWidth > element.clientWidth)
      .filter((element) => !['auto', 'scroll'].includes(getComputedStyle(element).overflowX)).length,
  }));
}

for (const route of representativeRoutes) {
  test(`${route} has no serious or critical automated accessibility violations`, async ({ page }) => {
    await page.goto(studyUrl(route));
    await page.waitForLoadState('networkidle');
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = result.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact));
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}

test('375px and 200%-zoom-equivalent layouts keep overflow local', async ({ page }) => {
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 800 });
    for (const route of ['/', '/start/', '/topics/frontend/', '/projects/react/', '/papers/react/']) {
      await page.goto(studyUrl(route));
      await page.waitForLoadState('networkidle');
      const layout = await layoutSnapshot(page);
      expect(layout.document, `${route} overflows the ${width}px viewport`).toBeLessThanOrEqual(layout.viewport + 1);
      expect(layout.badCodeBlocks, `${route} has non-scrollable overflowing code`).toBe(0);
    }
  }
});

test('mobile-320 contract keeps page overflow out of the viewport and code overflow local', async ({ page }) => {
  for (const route of ['/', '/start/', '/topics/frontend/', '/projects/react/', '/papers/react/']) {
    await page.goto(studyUrl(route));
    await page.waitForLoadState('networkidle');
    const layout = await layoutSnapshot(page);
    expect(layout.document, `${route} overflows the 320px viewport`).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.badCodeBlocks, `${route} has non-scrollable overflowing code`).toBe(0);
  }
});

test('search Escape closes the dialog and restores trigger focus', async ({ page }) => {
  await page.goto(studyUrl('/'));
  const trigger = page.getByRole('button', { name: '搜索', exact: true });
  await expect(trigger).toBeEnabled();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '搜索', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('reduced motion preference keeps study interactions free of long animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(studyUrl('/'));
  const longAnimations = await page.evaluate(() => [...document.querySelectorAll('.study-shell *')]
    .map((element) => getComputedStyle(element))
    .filter((style) => style.animationName !== 'none' && Number.parseFloat(style.animationDuration) > 0.01)
    .length);
  expect(longAnimations).toBe(0);
});

test('light and dark modes keep representative pages free of blocking axe violations', async ({ page }) => {
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    for (const route of ['/', '/papers-atlas/', '/projects/react/']) {
      await page.goto(studyUrl(route));
      await page.waitForLoadState('networkidle');
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const blocking = result.violations.filter(({ impact }) => ['serious', 'critical'].includes(impact));
      expect(blocking, `${colorScheme} ${route}: ${JSON.stringify(blocking, null, 2)}`).toEqual([]);
    }
  }
});

test('WCAG text spacing does not hide content or create page overflow', async ({ page }) => {
  for (const route of ['/', '/start/', '/topics/frontend/']) {
    await page.goto(studyUrl(route));
    await page.addStyleTag({ content: `
      .study-shell * {
        line-height: 1.5 !important;
        letter-spacing: 0.12em !important;
        word-spacing: 0.16em !important;
      }
      .study-shell p { margin-bottom: 2em !important; }
    ` });
    const layout = await layoutSnapshot(page);
    expect(layout.document, `${route} overflows with WCAG text spacing`).toBeLessThanOrEqual(layout.viewport + 1);
    await expect(page.locator('main').first()).toBeVisible();
  }
});

test('keyboard path reaches a note and search returns focus without a trap', async ({ page }) => {
  await page.goto(studyUrl('/'));
  const pathCard = page.locator('a.study-path-card').first();
  await pathCard.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/study\/topics\//);

  const noteLink = page.locator('main a[href^="/study/papers/"], main a[href^="/study/projects/"]').first();
  await noteLink.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/study\/(papers|projects)\//);

  const searchTrigger = page.getByRole('button', { name: '搜索', exact: true });
  await searchTrigger.focus();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: '搜索', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(searchTrigger).toBeFocused();
});

test('primary study controls meet the 24 CSS px target-size floor', async ({ page }) => {
  await page.goto(studyUrl('/'));
  const undersized = await page.locator('.study-button, .study-button-secondary, a.study-path-card, site-search button')
    .evaluateAll((elements) => elements
      .map((element) => ({ label: element.textContent?.trim() || element.getAttribute('aria-label'), rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0)
      .filter(({ rect }) => rect.width < 24 || rect.height < 24)
      .map(({ label, rect }) => ({ label, width: rect.width, height: rect.height })));
  expect(undersized).toEqual([]);
});
