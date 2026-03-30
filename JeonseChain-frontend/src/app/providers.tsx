'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Config, WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createWagmiConfig } from '@/lib/wagmi';
import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [wagmiConfig, setWagmiConfig] = useState<Config | null>(null);

  useEffect(() => {
    setMounted(true);
    setWagmiConfig(createWagmiConfig());
  }, []);

  if (!mounted || !wagmiConfig) {
    return <div className="min-h-screen bg-transparent" />;
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#22d3ee',
            accentColorForeground: '#04111d',
            borderRadius: 'large',
          })}
          locale="en"
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
