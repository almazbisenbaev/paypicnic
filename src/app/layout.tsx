import type { Metadata } from "next";
import { Header, Footer, TestNotice } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paypicnic — Good work. Fair shares.",
  description:
    "One payment link for your team of two. Split test USDC directly between two Solana wallets with one verified receipt.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <Header />
        <TestNotice />
        {children}
        <Footer />
      </body>
    </html>
  );
}
