import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VFAT ↔ HL Hedgeability Scanner',
  description: 'Scan DeFi farms and check if assets can be hedged on Hyperliquid perps',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
