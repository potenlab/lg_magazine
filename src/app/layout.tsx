import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
  fallback: ["system-ui", "sans-serif"],
});

const ridiBatang = localFont({
  src: "../../node_modules/@kfonts/ridi-batang/RIDIBatang.woff2",
  variable: "--font-ridi-batang",
  display: "swap",
  weight: "400",
});

const nanumSeongSirCe = localFont({
  src: "../../NanumSeongSirCe.ttf",
  variable: "--font-nanum-seongsirce",
  display: "swap",
  weight: "400",
});

export const metadata: Metadata = {
  title: "Magazine STORY · Vision Express",
  description: "당신만을 위한 단 한 호의 매거진",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${pretendard.variable} ${ridiBatang.variable} ${nanumSeongSirCe.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
