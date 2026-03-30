'use client';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export function createWagmiConfig() {
  return getDefaultConfig({
    appName: '전세안심체인 (JeonseChain)',
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID || 'jeonsechain-demo',
    chains: [sepolia],
    ssr: false,
  });
}
