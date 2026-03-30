'use client';

import { useEffect, useMemo, useState } from 'react';
import { ADDRESS_BOOK, AddressRecord } from '@/lib/demo-data';

type AddressSearchPanelProps = {
  selectedAddress: AddressRecord | null;
  onSelect: (record: AddressRecord) => void;
};

export default function AddressSearchPanel({
  selectedAddress,
  onSelect,
}: AddressSearchPanelProps) {
  const [query, setQuery] = useState(selectedAddress?.roadAddress ?? '');
  const mapEmbedUrl = useMemo(() => buildMapEmbedUrl(selectedAddress), [selectedAddress]);

  useEffect(() => {
    if (!selectedAddress) return;
    setQuery(selectedAddress.roadAddress);
  }, [selectedAddress]);

  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return ADDRESS_BOOK;

    return ADDRESS_BOOK.filter((item) =>
      [item.roadAddress, item.building, item.district].some((field) =>
        field.toLowerCase().includes(keyword),
      ),
    );
  }, [query]);

  return (
    <section className="glass-card overflow-hidden p-5 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Address Search</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">주소 검색 후 계약 흐름을 시작하세요</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            실제 MVP에서는 도로명주소 API로 연결하면 되고, 지금은 데모용 샘플 주소와 리스크 스코어, 미니 지도 프리뷰를 먼저 붙여놨습니다.
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-slate-300">
          주소 선택 → 계약 정보 입력 → 지갑 연결
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_360px]">
        <div>
          <label className="block">
            <span className="text-sm font-medium text-slate-200">도로명주소 또는 건물명</span>
            <div className="mt-3 flex items-center gap-3 rounded-[24px] border border-white/10 bg-slate-950/50 px-4 py-3">
              <span className="text-lg">⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="예: 서울 마포구 월드컵북로 402"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="검색어 지우기"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-sm text-slate-300 transition hover:border-cyan-300/30 hover:text-white"
                >
                  ×
                </button>
              ) : null}
            </div>
          </label>

          <div className="mt-4 grid gap-3">
            {results.map((item) => {
              const selected = selectedAddress?.id === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setQuery(item.roadAddress);
                    onSelect(item);
                  }}
                  className={`rounded-[24px] border p-4 text-left transition ${
                    selected
                      ? 'border-cyan-300/30 bg-cyan-300/10'
                      : 'border-white/10 bg-slate-950/40 hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.roadAddress}</p>
                      <p className="mt-1 text-sm text-slate-400">{item.building}</p>
                    </div>
                    <RiskBadge score={item.riskScore} label={item.riskLabel} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{item.district}</span>
                    <span>{item.lat.toFixed(3)}, {item.lng.toFixed(3)}</span>
                    <span>{selected ? '선택됨' : '선택 가능'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-slate-950/55 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Mini Map Preview</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {selectedAddress ? selectedAddress.building : '주소를 선택하면 미리보기가 나옵니다'}
              </p>
            </div>
            {selectedAddress ? (
              <RiskBadge score={selectedAddress.riskScore} label={selectedAddress.riskLabel} />
            ) : null}
          </div>

          <div className="mt-5 h-56 overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_42%),linear-gradient(135deg,_rgba(2,6,23,0.92),_rgba(15,23,42,0.82))] p-4">
            <div className="relative h-full overflow-hidden rounded-[18px] border border-white/10">
              {selectedAddress ? (
                <>
                  <iframe
                    key={selectedAddress.id}
                    title={`${selectedAddress.building} 지도`}
                    src={mapEmbedUrl}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.12),rgba(2,6,23,0.38))]" />
                  <div className="mini-map-pulse pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/40 bg-cyan-300/12 blur-md" />
                  <div className="mini-map-route pointer-events-none absolute left-1/2 top-[52%] h-px w-[36%] -translate-x-1/2 bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent" />
                  <div className="map-pin-drop pointer-events-none absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-[85%] items-center justify-center rounded-full border border-cyan-200/50 bg-slate-950/90 text-xl shadow-[0_0_30px_rgba(34,211,238,0.28)]">
                    📍
                  </div>
                  <div className="absolute right-[18%] top-[28%] rounded-[18px] border border-white/10 bg-slate-950/80 px-3 py-2 text-center">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">선택 주소</p>
                    <p className="mt-1 text-xs font-medium text-white">계약 등록 준비 완료</p>
                  </div>
                  <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3">
                    <p className="text-sm font-semibold text-white">{selectedAddress.roadAddress}</p>
                    <p className="mt-1 text-xs text-slate-400">{selectedAddress.building}</p>
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  선택된 주소의 위치와 리스크 상태를 여기서 보여줍니다.
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-medium text-white">다음 연결 포인트</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              선택한 주소는 임대인 패널의 부동산 라벨 제안값으로 넘겨서 계약 등록 입력 피로를 줄일 수 있습니다.
            </p>
            {selectedAddress ? (
              <a
                href={`https://www.openstreetmap.org/?mlat=${selectedAddress.lat}&mlon=${selectedAddress.lng}#map=17/${selectedAddress.lat}/${selectedAddress.lng}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex rounded-full border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:border-cyan-300/30 hover:bg-white/[0.05]"
              >
                실제 지도에서 열기
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function buildMapEmbedUrl(record: AddressRecord | null) {
  if (!record) return '';

  const delta = 0.0042;
  const left = record.lng - delta;
  const right = record.lng + delta;
  const top = record.lat + delta;
  const bottom = record.lat - delta;

  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${record.lat}%2C${record.lng}`;
}

function RiskBadge({ score, label }: { score: number; label: string }) {
  const tone =
    label === 'Safe'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : label === 'Monitor'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
        : 'border-rose-500/30 bg-rose-500/10 text-rose-200';

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}
      title={`리스크 스코어 ${score}/100`}
    >
      {label} {score}
    </span>
  );
}
