import { Font } from "@react-pdf/renderer";

let registered = false;

export function registerPdfFonts() {
  if (registered) return;
  try {
    // react-pdf/fontkit is much safer with TTF than WOFF2 in the browser.
    // The NotoSerifKR files below contain real TTF data; register them as the
    // single PDF font source and alias Pretendard to the same files so all
    // styles resolve without falling back to Helvetica, which cannot render KR.
    Font.register({
      family: "Pretendard",
      fonts: [
        { src: "/fonts/v3/NotoSerifKR-Regular.ttf", fontWeight: 400 },
        { src: "/fonts/v3/NotoSerifKR-Medium.ttf", fontWeight: 700 },
      ],
    });
  } catch (err) {
    console.warn("[v3 PDF] Pretendard alias registration failed", err);
  }

  try {
    Font.register({
      family: "Noto Serif KR",
      fonts: [
        { src: "/fonts/v3/NotoSerifKR-Regular.ttf", fontWeight: 400 },
        { src: "/fonts/v3/NotoSerifKR-Medium.ttf", fontWeight: 500 },
        { src: "/fonts/v3/NotoSerifKR-Medium.ttf", fontWeight: 700 },
      ],
    });
  } catch (err) {
    console.warn("[v3 PDF] Noto Serif KR registration failed", err);
  }

  // Disable hyphenation for Korean
  try {
    Font.registerHyphenationCallback((word) => [word]);
  } catch {
    /* ignore */
  }

  registered = true;
}
