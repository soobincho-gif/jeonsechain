'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ActivityItem } from '@/lib/workflow';
import { formatClock } from '@/lib/format';

type NotificationCenterProps = {
  items: ActivityItem[];
  unreadCount: number;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
};

export default function NotificationCenter({
  items,
  unreadCount,
  isOpen,
  onToggle,
  onClose,
}: NotificationCenterProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const drawer =
    mounted && isOpen
      ? createPortal(
          <div className="fixed inset-0 z-[120]">
            <button
              aria-label="알림 닫기"
              onClick={onClose}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px]"
            />
            <aside className="fixed right-0 top-0 z-[130] h-full w-full max-w-md border-l border-white/10 bg-[#07131f] p-5 shadow-[0_0_80px_rgba(2,6,23,0.72)] backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Notification Center</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">활동 알림</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    화면 상단 토스트는 잠깐만 보이고, 자세한 기록은 여기에서 확인합니다.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:border-cyan-300/30"
                  >
                    닫기
                  </button>
                  <button
                    onClick={onClose}
                    aria-label="알림 센터 닫기"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-sm text-slate-300 transition hover:border-cyan-300/30 hover:text-white"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-2 text-xs text-slate-400">
                <span className="rounded-full border border-white/10 px-3 py-1">최근 {Math.min(items.length, 12)}건</span>
                <span className="rounded-full border border-white/10 px-3 py-1">시스템 / 계약 / 위험 / 완료</span>
              </div>

              <div className="mt-5 max-h-[calc(100vh-180px)] space-y-3 overflow-y-auto pr-1">
                {items.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-10 text-center">
                    <p className="text-sm font-medium text-white">아직 알림이 없어요</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      계약 등록, 보증금 예치, 위험 신호 감지 같은 이벤트가 생기면 여기에 쌓입니다.
                    </p>
                  </div>
                ) : (
                  items.map((item) => (
                    <div key={item.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${toneDot(item.tone)}`} />
                          <p className="text-sm font-semibold text-white">{item.title}</p>
                        </div>
                        <span className="text-xs text-slate-500">{formatClock(item.timestamp)}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p>
                    </div>
                  ))
                )}
              </div>
            </aside>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        onClick={onToggle}
        className="relative rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-100 transition hover:border-cyan-300/30 hover:bg-white/[0.05]"
      >
        알림
        {unreadCount > 0 ? (
          <span className="ml-2 rounded-full bg-cyan-300 px-2 py-0.5 text-[11px] font-semibold text-slate-950">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {drawer}
    </>
  );
}

function toneDot(tone: ActivityItem['tone']) {
  if (tone === 'success') return 'bg-emerald-400';
  if (tone === 'warning') return 'bg-amber-400';
  return 'bg-cyan-300';
}
