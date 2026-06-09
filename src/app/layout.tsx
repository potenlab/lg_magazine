import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fonts are subset to the full Hangul Syllables block (U+AC00–U+D7A3) plus
// Latin/Jamo/CJK punctuation. This drops hanja, CJK extensions, and unused
// symbol tables while keeping every modern Korean syllable, so dynamic
// LLM-generated Korean text cannot render as tofu. Subset outputs are
// version-controlled in public/fonts/subset/ (see Task 1, font diet).
const pretendard = localFont({
  src: "../../public/fonts/subset/PretendardVariable.subset.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
  fallback: ["system-ui", "sans-serif"],
});

const ridiBatang = localFont({
  src: "../../public/fonts/subset/RIDIBatang.subset.woff2",
  variable: "--font-ridi-batang",
  display: "swap",
  weight: "400",
});

// Hand-written letterhead font used only inside the IntroScene invite-letter
// phase (rendered after the user opens the envelope), so it is not on the
// first-paint path — skip preload to avoid competing for cold-load bandwidth.
const nanumSeongSirCe = localFont({
  src: "../../public/fonts/subset/NanumSeongSirCe.subset.woff2",
  variable: "--font-nanum-seongsirce",
  display: "swap",
  weight: "400",
  preload: false,
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
