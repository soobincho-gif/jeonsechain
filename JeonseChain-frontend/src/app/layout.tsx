import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Providers from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: '전세체인 — 전세보증금 스마트 보호 플랫폼',
  description: '블록체인 기반 전세보증금 구조 보호 서비스. 계약 등록부터 정산까지 투명하게.',
  openGraph: {
    title: '전세체인',
    description: '전세보증금 구조 보호 플랫폼',
    siteName: '전세체인',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '전세체인',
    description: '전세보증금 구조 보호 플랫폼',
  },
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
