'use client';

import { ActivityItem } from '@/lib/workflow';

type ToastStackProps = {
  items: ActivityItem[];
};

export default function ToastStack({ items }: ToastStackProps) {
  const item = items[0];

  if (!item) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(340px,calc(100vw-2rem))] flex-col gap-3">
      <div
        key={item.id}
        className={`rounded-[20px] border px-4 py-4 shadow-[0_20px_70px_rgba(2,6,23,0.45)] backdrop-blur-xl transition ${
          item.tone === 'success'
            ? 'border-emerald-400/20 bg-emerald-400/10'
            : item.tone === 'warning'
              ? 'border-amber-400/20 bg-amber-400/10'
              : 'border-cyan-300/20 bg-slate-950/80'
        }`}
      >
        <p className="text-sm font-semibold text-white">{item.title}</p>
        <p className="mt-2 text-sm leading-6 text-slate-200">{item.description}</p>
      </div>
    </div>
  );
}
