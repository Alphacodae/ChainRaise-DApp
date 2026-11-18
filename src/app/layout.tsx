import type { Metadata } from "next";
import { WalletProvider } from "@/components/wallet-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChainRaise",
  description: "Empowering ideas through transparent, secure and trustless fundraising.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col"><WalletProvider>{children}</WalletProvider></body>
    </html>
  );
}
