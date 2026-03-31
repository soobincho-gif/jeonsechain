const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

test.describe('JeonseChain frontend smoke', () => {
  test('current information architecture, register flow, and activity controls work', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByRole('heading', { name: '처음 보는 사람도 5초 안에 이해할 수 있게 시작점을 나눴습니다' })).toBeVisible();
    await expect(page.getByRole('button', { name: /체험하기/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /내 계약/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /더보기/ }).first()).toBeVisible();

    await page.getByRole('button', { name: /내 계약/ }).first().click();
    await expect(page.getByRole('heading', { name: /주소 검색부터 계약 등록/ })).toBeVisible();
    const addressInput = page.getByPlaceholder('예: 서울 마포구 월드컵북로 402');
    await addressInput.fill('구로');
    await page.getByRole('button', { name: /서울 구로구 디지털로 300/ }).click();
    await expect(page.getByText('구로 스마트밸리 주상복합').first()).toBeVisible();
    await expect(page.getByText('추천 판단')).toBeVisible();

    await page.getByRole('button', { name: '검색어 지우기' }).click();
    await expect(addressInput).toHaveValue('');

    await page.getByRole('button', { name: '새 전세계약 등록' }).click();
    await expect(page.getByText('등록 준비 화면을 열었어요')).toBeVisible();
    await expect(page.getByRole('heading', { name: '임대인 계약 등록' })).toBeVisible();

    await page.getByRole('button', { name: /더보기/ }).first().click();
    await page.getByRole('button', { name: '활동 로그' }).click();
    await expect(page.getByRole('heading', { name: '최근 활동과 시스템 반영 기록' })).toBeVisible();
    const autoRefreshButton = page.getByRole('button', { name: /자동 새로고침/ });
    await expect(autoRefreshButton).toContainText('자동 새로고침 켜짐');
    await autoRefreshButton.click();
    await expect(autoRefreshButton).toContainText('자동 새로고침 꺼짐');
    await autoRefreshButton.click();
    await expect(autoRefreshButton).toContainText('자동 새로고침 켜짐');

    await page.getByRole('button', { name: '지금 새로고침' }).click();
    await expect(page.getByText('실시간 모니터')).toBeVisible();

    await page.getByRole('button', { name: /^알림/ }).click();
    await expect(page.getByRole('heading', { name: '활동 알림' })).toBeVisible();
    await page.getByRole('button', { name: '알림 센터 닫기' }).click();
    await expect(page.getByRole('heading', { name: '활동 알림' })).toBeHidden();
  });

  test('responsive layout keeps current navigation and register view inside viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE_URL);

    await expect(page.getByRole('button', { name: /체험하기/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /내 계약/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /더보기/ }).first()).toBeVisible();

    await page.getByRole('button', { name: /내 계약/ }).first().click();
    await expect(page.getByRole('heading', { name: /주소 검색부터 계약 등록/ })).toBeVisible();
    await page.getByRole('button', { name: '새 전세계약 등록' }).click();
    await expect(page.getByRole('heading', { name: '임대인 계약 등록' })).toBeVisible();

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
