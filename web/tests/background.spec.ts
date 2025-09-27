import { test, expect } from '@playwright/test';
test('background image element presence', async ({ page }) => {
  await page.goto('/');

  const backgroundImg = page.locator('img[alt="Neon city skyline background"]');
  await expect(backgroundImg).toBeVisible();

  const opacity = await backgroundImg.evaluate((el) => getComputedStyle(el).opacity);
  console.log(`[debug] background image opacity: ${opacity}`);

  const overlayOpacities = await page.locator('.pointer-events-none.absolute.inset-0 > div').evaluateAll((elements) =>
    elements.map((el) => ({
      backgroundImage: getComputedStyle(el).backgroundImage,
      opacity: getComputedStyle(el).opacity,
      mixBlendMode: getComputedStyle(el).mixBlendMode,
    }))
  );
  console.log(`[debug] overlay layers: ${JSON.stringify(overlayOpacities, null, 2)}`);
});
