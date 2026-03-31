const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

test.describe('JeonseChain frontend smoke', () => {
  test('role entry points and demo-to-workspace links work', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByRole('heading', { name: /임대인, 임차인,/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '핵심 데모 보기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '임대인 화면 열기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '임차인 화면 열기' })).toBeVisible();

    await page.getByRole('button', { name: '핵심 데모 보기' }).click();
    await expect(page.getByRole('heading', { name: /처음 보는 사람 기준으로/ })).toBeVisible();
    await page.getByRole('button', { name: /퇴실 정산 계약/ }).click();
    await expect(page.getByRole('heading', { name: /데모 "퇴실 정산 계약".*실제로 보여주는 것/ })).toBeVisible();
    await expect(page.getByText('지갑 없이 읽는 고정 역할 데모')).toBeVisible();

    await page.getByRole('button', { name: '실제 계약 조회 화면', exact: true }).click();
    await expect(page.getByRole('heading', { name: '내 계약 상세 조회' })).toBeVisible();

    await page.getByRole('button', { name: /^알림/ }).click();
    await expect(page.getByRole('heading', { name: '활동 알림' })).toBeVisible();
    await page.getByRole('button', { name: '알림 센터 닫기' }).click();
    await expect(page.getByRole('heading', { name: '활동 알림' })).toBeHidden();
  });

  test('responsive layout keeps role-first landing and contract panels inside viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE_URL);

    await page.getByRole('button', { name: '임차인 화면 열기' }).click();
    await expect(page.getByRole('heading', { name: '임차인 확인 및 보증금 예치' })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
      rootClientWidth: document.documentElement.clientWidth,
    }));

    expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(dimensions.bodyClientWidth + 1);
    expect(dimensions.rootScrollWidth).toBeLessThanOrEqual(dimensions.rootClientWidth + 1);
  });

  test('manual address selection updates the contract start point and map preview', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.getByRole('button', { name: '임대인 화면 열기' }).click();
    await expect(page.getByRole('heading', { name: '임대인 계약 등록' })).toBeVisible();

    const addressInput = page.getByPlaceholder('예: 서울 마포구 월드컵북로 402').first();
    await addressInput.fill('서울 송파구 올림픽로 300');

    await expect(page.getByText('직접 입력 주소로 계약 등록 진행')).toBeVisible();
    await page.getByRole('button', { name: /서울 송파구 올림픽로 300/ }).click();

    await expect(page.getByText('직접 입력 주소 · 오라클 반영 전')).toBeVisible();
    await expect(page.getByText('이번 주소 기준 leaseId 생성 전')).toBeVisible();
    await expect(page.getByText('서울 송파구 올림픽로 300').first()).toBeVisible();

    const mapFrame = page.locator('iframe[title$="지도"]').first();
    await expect(mapFrame).toBeVisible();
    await expect(mapFrame).toHaveAttribute('src', /%EC%84%9C%EC%9A%B8%20%EC%86%A1%ED%8C%8C%EA%B5%AC%20%EC%98%AC%EB%A6%BC%ED%94%BD%EB%A1%9C%20300/);
  });
});
