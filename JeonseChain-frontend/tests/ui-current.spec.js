const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

test.describe('JeonseChain current IA smoke', () => {
  test('landing, more menu, demo flow, and contract flow work together', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByRole('heading', { name: '처음 보는 사람도 5초 안에 이해할 수 있게 시작점을 나눴습니다' })).toBeVisible();
    await expect(page.getByRole('button', { name: /체험하기/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /내 계약/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /더보기/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '데모 시작' })).toBeVisible();
    await expect(page.getByRole('button', { name: '내 계약 보기' })).toBeVisible();

    await page.getByRole('button', { name: /더보기/ }).first().click();
    await expect(page.getByRole('heading', { name: /기술 정보는 뒤로 빼고/ })).toBeVisible();

    await page.getByRole('button', { name: '위험 신호' }).click();
    await expect(page.getByText('상태로 보는 이유를 쉬운 언어로 정리했습니다')).toBeVisible();

    await page.getByRole('button', { name: '신뢰 프로필' }).click();
    await expect(page.getByText('역할별로 보면 더 이해가 쉬워요')).toBeVisible();
    await expect(page.getByRole('button', { name: '임대인 관점' })).toBeVisible();
    await page.getByRole('button', { name: '임차인 관점' }).click();
    await expect(page.getByText('임차인 기준 프로세스')).toBeVisible();

    await page.getByRole('button', { name: '활동 로그' }).click();
    await expect(page.getByRole('heading', { name: '최근 활동과 시스템 반영 기록' })).toBeVisible();
    await expect(page.getByText('실시간 모니터')).toBeVisible();

    await page.getByRole('button', { name: '데이터 근거' }).click();
    await expect(page.getByText('점수 산출 근거')).toBeVisible();
    await expect(page.getByText('HUG 멀티시그 거버넌스')).toBeVisible();
    await expect(page.getByText('LTV 미확인')).toBeVisible();
    await page.getByRole('button', { name: '최신 데이터 다시 보기' }).click();

    await page.getByRole('button', { name: 'FAQ' }).click();
    await expect(page.getByText('보증금 보호함이 뭐예요?')).toBeVisible();

    await page.getByRole('button', { name: /체험하기/ }).first().click();
    await expect(page.getByRole('heading', { name: /샘플 계약으로/ })).toBeVisible();
    await expect(page.getByText('계약 시나리오 가이드')).toBeVisible();

    await page.getByRole('button', { name: /위험 계약/ }).click();
    await expect(page.getByText('위험 신호가 감지되어 보호 조치가 필요해요.').first()).toBeVisible();

    await page.getByRole('button', { name: /퇴실 정산 계약/ }).click();
    await expect(page.getByText('무분쟁 금액은 정리됐고, 임차인 응답을 기다리는 상태예요.').first()).toBeVisible();
    await expect(page.getByText('247,840,000 KRW')).toBeVisible();
    await expect(page.getByText('2,160,000 KRW')).toBeVisible();

    await page.getByRole('button', { name: '정산 요청 접수' }).click();
    await expect(page.getByText('임대인이 정산 요청과 증빙을 접수한 상태예요.').first()).toBeVisible();
    await expect(page.getByText('248,800,000 KRW')).toBeVisible();
    await expect(page.getByText('1,200,000 KRW')).toBeVisible();

    await page.getByRole('button', { name: /내 계약/ }).first().click();
    await expect(page.getByRole('heading', { name: /주소 검색부터 계약 등록/ })).toBeVisible();

    const addressInput = page.getByPlaceholder('예: 서울 마포구 월드컵북로 402');
    await addressInput.fill('구로');
    await page.getByRole('button', { name: /서울 구로구 디지털로 300/ }).click();
    await expect(page.getByText('구로 스마트밸리 주상복합').first()).toBeVisible();
    await expect(page.getByText('추천 판단')).toBeVisible();
    await expect(page.getByText('비추천')).toBeVisible();

    await page.getByRole('button', { name: '검색어 지우기' }).click();
    await expect(addressInput).toHaveValue('');

    await page.getByRole('button', { name: '새 전세계약 등록' }).click();
    await expect(page.getByText('등록 준비 화면을 열었어요')).toBeVisible();
    await expect(page.getByRole('heading', { name: '임대인 계약 등록' })).toBeVisible();

    await page.getByRole('button', { name: /더보기/ }).first().click();
    await page.getByRole('button', { name: '활동 로그' }).click();
    const autoRefreshButton = page.getByRole('button', { name: /자동 새로고침/ });
    await expect(autoRefreshButton).toContainText('자동 새로고침 켜짐');
    await autoRefreshButton.click();
    await expect(autoRefreshButton).toContainText('자동 새로고침 꺼짐');
    await autoRefreshButton.click();
    await expect(autoRefreshButton).toContainText('자동 새로고침 켜짐');
    await page.getByRole('button', { name: '지금 새로고침' }).click();

    await page.getByRole('button', { name: /^알림/ }).click();
    await expect(page.getByRole('heading', { name: '활동 알림' })).toBeVisible();
    await page.getByRole('button', { name: '알림 센터 닫기' }).click();
    await expect(page.getByRole('heading', { name: '활동 알림' })).toBeHidden();
  });

  test('mobile layout keeps new top navigation and main panels inside viewport', async ({ page }) => {
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
