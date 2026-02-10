import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppWalletProvider } from "@/providers/WalletProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agent Proof-of-Intelligence | Solana",
  description: "On-chain verification that AI agents are who they claim to be",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{
          background: "var(--bg-deep)",
          color: "var(--text-primary)",
        }}
      >
        <AppWalletProvider>{children}</AppWalletProvider>
      </body>
    </html>
  );
}
