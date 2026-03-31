const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

test.describe('JeonseChain role-based IA smoke', () => {
  test('landing, more menu, demos, and role workspaces connect in one flow', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByRole('heading', { name: /임대인, 임차인,/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '핵심 데모 보기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '임대인 화면 열기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '임차인 화면 열기' })).toBeVisible();

    await page.getByRole('button', { name: /더보기/ }).first().click();
    await expect(page.getByRole('heading', { name: /기술 정보는 뒤로 빼고/ })).toBeVisible();

    await page.getByRole('button', { name: '위험 신호' }).click();
    await expect(page.getByText('상태로 보는 이유를 쉬운 언어로 정리했습니다')).toBeVisible();

    await page.getByRole('button', { name: '활동 로그' }).click();
    await expect(page.getByRole('heading', { name: '최근 활동과 시스템 반영 기록' })).toBeVisible();
    await expect(page.getByText('실시간 모니터')).toBeVisible();

    await page.getByRole('button', { name: '데이터 근거' }).click();
    await expect(page.getByText('점수 산출 근거')).toBeVisible();
    await expect(page.getByText('HUG 멀티시그 거버넌스')).toBeVisible();

    await page.getByRole('button', { name: 'FAQ' }).click();
    await expect(page.getByText('보증금 보호함이 뭐예요?')).toBeVisible();

    await page.getByRole('button', { name: /^JeonseChain$/ }).click();
    await expect(page.getByRole('heading', { name: /임대인, 임차인,/ })).toBeVisible();

    await page.getByRole('button', { name: '임차인 관련 데모' }).click();
    await expect(page.getByRole('heading', { name: /임차인 기준으로/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /데모 "퇴실 정산 계약".*실제로 보여주는 것/ })).toBeVisible();
    await expect(page.getByText('정산 상태 임차인 응답 대기')).toBeVisible();

    await page.getByRole('button', { name: '임차인 화면' }).click();
    await expect(page.getByRole('heading', { name: /주소 검색부터 계약 등록/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: '임차인 확인 및 보증금 예치' })).toBeVisible();
    await expect(page.getByText('임차인 화면은 leaseId 확인까지 먼저 볼 수 있어요')).toBeVisible();
    await expect(page.getByRole('button', { name: '이 계약 사용' })).toBeVisible();

    await page.getByRole('button', { name: '임대인 데모 보기' }).click();
    await expect(page.getByRole('heading', { name: /임대인 기준으로/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /데모 "위험 계약".*실제로 보여주는 것/ })).toBeVisible();
    await page.getByRole('button', { name: '계약 조회 화면', exact: true }).click();
    await expect(page.getByRole('heading', { name: '내 계약 상세 조회' })).toBeVisible();
    await expect(page.getByText('계약 조회 화면은 지갑 없이도 먼저 읽어볼 수 있어요')).toBeVisible();
  });

  test('mobile layout keeps role entry cards and workspaces inside viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE_URL);

    await expect(page.getByRole('button', { name: '핵심 데모 보기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '임대인 화면 열기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '임차인 화면 열기' })).toBeVisible();

    await page.getByRole('button', { name: '임대인 화면 열기' }).click();
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
