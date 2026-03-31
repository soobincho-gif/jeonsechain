'use client';

import { useEffect, useMemo, useState } from 'react';
import { ADDRESS_BOOK, AddressRecord } from '@/lib/demo-data';
import { OracleRiskPreview } from '@/lib/property';

type AddressSearchPanelProps = {
  selectedAddress: AddressRecord | null;
  postalCode: string;
  detailAddress: string;
  selectedRiskOverride?: OracleRiskPreview | null;
  onSelect: (record: AddressRecord) => void;
  onPostalCodeChange: (value: string) => void;
  onDetailAddressChange: (value: string) => void;
};

export default function AddressSearchPanel({
  selectedAddress,
  postalCode,
  detailAddress,
  selectedRiskOverride,
  onSelect,
  onPostalCodeChange,
  onDetailAddressChange,
}: AddressSearchPanelProps) {
  const [query, setQuery] = useState(selectedAddress?.roadAddress ?? '');
  const normalizedQuery = query.trim();
  const mapEmbedUrl = useMemo(
    () => buildMapEmbedUrl(selectedAddress, detailAddress, normalizedQuery),
    [detailAddress, normalizedQuery, selectedAddress],
  );
  const mapLinkUrl = useMemo(
    () => buildMapLinkUrl(selectedAddress, detailAddress, normalizedQuery),
    [detailAddress, normalizedQuery, selectedAddress],
  );

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

  const canUseManualAddress =
    normalizedQuery.length > 0 &&
    normalizedQuery !== selectedAddress?.roadAddress.trim();
  const manualAddressRecord = canUseManualAddress
    ? buildManualAddressRecord(normalizedQuery, postalCode.trim())
    : null;
  const postalInputEditable = Boolean(manualAddressRecord || selectedAddress?.source === 'manual');

  const selectedRisk = selectedAddress
    ? {
        score: selectedRiskOverride?.score ?? selectedAddress.riskScore,
        label: selectedRiskOverride?.label ?? selectedAddress.riskLabel,
        sourceLabel:
          selectedAddress.source === 'manual'
            ? '직접 입력 주소 · 오라클 반영 전'
            : selectedRiskOverride?.sourceLabel ?? '기본 샘플 주소 기준',
      }
    : null;

  return (
    <section className="glass-card overflow-hidden p-5 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">부동산 주소 검색</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">주소 검색 후 계약 흐름을 시작하세요</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            주소를 선택하면 해당 지역의 리스크 스코어와 지도 미리보기가 바로 표시됩니다. 선택한 주소는 계약 등록 첫 단계로 자동으로 이어집니다.
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
            {manualAddressRecord ? (
              <button
                type="button"
                onClick={() => onSelect(manualAddressRecord)}
                className={`rounded-[24px] border p-4 text-left transition ${
                  selectedAddress?.id === manualAddressRecord.id
                    ? 'border-cyan-300/30 bg-cyan-300/10'
                    : 'border-cyan-300/20 bg-cyan-300/10 hover:border-cyan-300/30 hover:bg-cyan-300/15'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{manualAddressRecord.roadAddress}</p>
                    <p className="mt-1 text-sm text-slate-400">직접 입력 주소로 계약 등록 진행</p>
                  </div>
                  <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                    직접 입력
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                  <span>주소록에 없는 위치도 등록 흐름으로 이어갈 수 있습니다.</span>
                  <span>{selectedAddress?.id === manualAddressRecord.id ? '선택됨' : '선택 가능'}</span>
                </div>
              </button>
            ) : null}

            {results.map((item) => {
              const selected = selectedAddress?.id === item.id;
              const displayRisk =
                selected && selectedRisk
                  ? { score: selectedRisk.score, label: selectedRisk.label }
                  : { score: item.riskScore, label: item.riskLabel };
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
                    <RiskBadge score={displayRisk.score} label={displayRisk.label} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>우편번호 {item.postalCode}</span>
                    <span>{item.district}</span>
                    <span>{item.lat.toFixed(3)}, {item.lng.toFixed(3)}</span>
                    <span>{selected ? '선택됨' : '선택 가능'}</span>
                  </div>
                </button>
              );
            })}

            {results.length === 0 && !manualAddressRecord ? (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-slate-950/35 px-4 py-6 text-sm text-slate-400">
                검색 결과가 없습니다. 주소를 조금 더 정확하게 입력하거나, 위의 직접 입력 카드로 계속 진행해 보세요.
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[140px_minmax(0,1fr)]">
            <label className="block">
              <span className="text-sm font-medium text-slate-200">우편번호</span>
              {postalInputEditable ? (
                <div className="mt-3 flex items-center gap-3 rounded-[24px] border border-white/10 bg-slate-950/50 px-4 py-3">
                  <span className="text-lg">#</span>
                  <input
                    value={postalCode}
                    onChange={(event) => onPostalCodeChange(event.target.value.replace(/\D/g, '').slice(0, 5))}
                    placeholder="예: 03925"
                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                  />
                </div>
              ) : (
                <div className="mt-3 rounded-[24px] border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white">
                  {selectedAddress?.postalCode ?? '주소 선택 후 표시'}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-400">
                {postalInputEditable
                  ? '직접 입력 주소는 우편번호도 함께 적어두면 계약 라벨과 요약 카드에 같이 반영됩니다.'
                  : '주소록에서 고른 우편번호는 자동으로 채워집니다.'}
              </p>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-200">상세주소</span>
              <div className="mt-3 flex items-center gap-3 rounded-[24px] border border-white/10 bg-slate-950/50 px-4 py-3">
                <span className="text-lg">⌂</span>
                <input
                  value={detailAddress}
                  onChange={(event) => onDetailAddressChange(event.target.value)}
                  placeholder="예: 101동 1203호"
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                실제 계약서에 들어갈 동·호수까지 함께 적어두면 등록 라벨과 계약 요약 카드에 같이 반영됩니다.
              </p>
            </label>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-slate-950/55 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">지도 미리보기</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {selectedAddress ? selectedAddress.building : '주소를 선택하면 미리보기가 나옵니다'}
              </p>
            </div>
            {selectedAddress ? (
              <RiskBadge score={selectedRisk?.score ?? selectedAddress.riskScore} label={selectedRisk?.label ?? selectedAddress.riskLabel} />
            ) : null}
          </div>

          <div className="mt-5 h-56 overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_42%),linear-gradient(135deg,_rgba(2,6,23,0.92),_rgba(15,23,42,0.82))] p-4">
            <div className="relative h-full overflow-hidden rounded-[18px] border border-white/10">
              {mapEmbedUrl ? (
                <>
                  <iframe
                    key={`${selectedAddress?.id ?? 'manual'}:${detailAddress}:${normalizedQuery}`}
                    title={`${selectedAddress?.building ?? '입력 주소'} 지도`}
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
                    <p className="text-sm font-semibold text-white">{selectedAddress?.roadAddress ?? normalizedQuery}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {selectedAddress?.building ?? '직접 입력 주소'}
                      {detailAddress ? ` · ${detailAddress}` : ''}
                    </p>
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
            <p className="text-sm font-medium text-white">계약 등록으로 이어집니다</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              선택한 주소와 상세주소는 아래 워크스페이스 1단계에 자동으로 불러와져 계약 등록 입력을 빠르게 시작할 수 있습니다.
            </p>
            {selectedRisk ? (
              <p className="mt-2 text-xs text-slate-400">현재 표시된 위험 점수 출처: {selectedRisk.sourceLabel}</p>
            ) : null}
            {mapLinkUrl ? (
              <a
                href={mapLinkUrl}
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

function buildManualAddressRecord(roadAddress: string, postalCode: string): AddressRecord {
  const district = roadAddress.split(' ')[1] || '직접 입력';

  return {
    id: `manual:${roadAddress}`,
    postalCode: postalCode || '직접 입력',
    roadAddress,
    building: '직접 입력 주소',
    district,
    lat: 37.5665,
    lng: 126.978,
    riskScore: 0,
    riskLabel: 'Monitor',
    source: 'manual',
  };
}

function buildMapQuery(record: AddressRecord | null, detailAddress: string, fallbackQuery: string) {
  const base = record?.roadAddress || fallbackQuery;
  const query = [base, detailAddress.trim()].filter(Boolean).join(' ');
  return query.trim();
}

function buildMapEmbedUrl(record: AddressRecord | null, detailAddress: string, fallbackQuery: string) {
  const query = buildMapQuery(record, detailAddress, fallbackQuery);
  if (!query) return '';
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`;
}

function buildMapLinkUrl(record: AddressRecord | null, detailAddress: string, fallbackQuery: string) {
  const query = buildMapQuery(record, detailAddress, fallbackQuery);
  if (!query) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function RiskBadge({ score, label }: { score: number; label: string }) {
  const displayLabel = label === 'Safe' ? '안전' : label === 'Monitor' ? '주의' : '위험';
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
      {displayLabel} {score}
    </span>
  );
}
