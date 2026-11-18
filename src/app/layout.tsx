import type { Metadata, Viewport } from "next";
import { WalletProvider } from "@/components/wallet-provider";
import { PwaProvider } from "@/components/pwa-provider";
import { InstallPrompt } from "@/components/install-prompt";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#141319",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "ChainRaise - Transparent Web3 Crowdfunding",
  description: "Empowering ideas through transparent, secure and trustless fundraising.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ChainRaise",
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <PwaProvider>
          <WalletProvider>
            <InstallPrompt />
            {children}
          </WalletProvider>
        </PwaProvider>
      </body>
    </html>
  );
}
