const { test, expect } = require('@playwright/test');

test.describe('JeonseChain frontend smoke', () => {
  test('core navigation, demo scenarios, notifications, and search controls work', async ({ page }) => {
    await page.goto('http://127.0.0.1:3001');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('한국형 부동산 금융 플랫폼');

    await page.getByRole('button', { name: /^알림/ }).click();
    await expect(page.getByRole('heading', { name: '활동 알림' })).toBeVisible();
    await page.getByRole('button', { name: '알림 센터 닫기' }).click();
    await expect(page.getByRole('heading', { name: '활동 알림' })).toBeHidden();

    await page.getByRole('button', { name: '새 전세계약 등록 준비' }).click();
    await expect(page.getByText('등록 준비 화면을 열었어요')).toBeVisible();

    const addressInput = page.getByPlaceholder('예: 서울 마포구 월드컵북로 402');
    await addressInput.fill('구로');
    await expect(page.getByRole('button', { name: /서울 구로구 디지털로 300/ })).toBeVisible();
    await page.getByRole('button', { name: '검색어 지우기' }).click();
    await expect(addressInput).toHaveValue('');

    await addressInput.fill('구로');
    await page.getByRole('button', { name: /서울 구로구 디지털로 300/ }).click();
    await expect(page.getByText('구로 스마트밸리 주상복합 · 주소 선택 완료')).toBeVisible();

    await page.getByRole('button', { name: '데모 시나리오 선택' }).click();
    await page.getByRole('button', { name: /계약 연장 시나리오/ }).click();
    await expect(page.getByText('만기 직전 연장 합의가 필요한 계약')).toBeVisible();

    await page.getByRole('button', { name: /중도 해지 시나리오/ }).click();
    await expect(page.getByText('중도 해지 합의 후 퇴실 정산으로 이어지는 계약')).toBeVisible();

    const autoRefreshButton = page.getByRole('button', { name: /자동 새로고침/ });
    await expect(autoRefreshButton).toContainText('자동 새로고침 켜짐');
    await autoRefreshButton.click();
    await expect(autoRefreshButton).toContainText('자동 새로고침 꺼짐');
    await autoRefreshButton.click();
    await expect(autoRefreshButton).toContainText('자동 새로고침 켜짐');

    await page.getByRole('button', { name: '지금 새로고침' }).click();
    await expect(page.getByText('실시간 모니터')).toBeVisible();
  });

  test('responsive layout keeps contract registration cards inside viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3001');

    await page.getByRole('button', { name: '새 전세계약 등록 준비' }).click();
    await expect(page.getByText('등록 준비 화면을 열었어요')).toBeVisible();
    await expect(page.getByRole('heading', { name: '임대인 계약 등록' })).toBeVisible();
    await expect(page.getByText('Preview', { exact: true })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
      rootClientWidth: document.documentElement.clientWidth,
    }));

    expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(dimensions.bodyClientWidth + 1);
    expect(dimensions.rootScrollWidth).toBeLessThanOrEqual(dimensions.rootClientWidth + 1);
  });
});
