import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// خط عربي أساسي (Cairo) يُحمَّل عبر next/font ويُعرّف كمتغيّر CSS
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "النظام المحاسبي — الخليلي والعزوني للزجاج والإكسسوارات والتركيب",
  description:
    "نظام محاسبي متكامل لإدارة الفوترة والعملاء والموردين والمخزون والتركيب والتقارير.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // المتطلب 12.1: اللغة العربية والاتجاه من اليمين إلى اليسار (RTL) كأساس
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
