import { Font } from "@react-pdf/renderer";

export function registerPdfFonts() {
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
        { src: "/fonts/v3/NotoSerifKR-Regular.ttf", fontWeight: 400, fontStyle: "italic" },
        { src: "/fonts/v3/NotoSerifKR-Medium.ttf", fontWeight: 700, fontStyle: "italic" },
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
        // italic variant 가 없어서 @react-pdf 내부에서 fontStyle:italic 을
        // 요청할 때 throw. 같은 파일로 alias 해 fallback.
        { src: "/fonts/v3/NotoSerifKR-Regular.ttf", fontWeight: 400, fontStyle: "italic" },
        { src: "/fonts/v3/NotoSerifKR-Medium.ttf", fontWeight: 500, fontStyle: "italic" },
        { src: "/fonts/v3/NotoSerifKR-Medium.ttf", fontWeight: 700, fontStyle: "italic" },
      ],
    });
  } catch (err) {
    console.warn("[v3 PDF] Noto Serif KR registration failed", err);
  }

  // 매거진 리디자인 시안 폰트 — 한글 본문/제목: MaruBuri, 영문 디스플레이:
  // Old Standard TT (magazine STORY 등). 둘 다 TTF 로 등록.
  try {
    Font.register({
      family: "MaruBuri",
      fonts: [
        { src: "/fonts/v3/MaruBuri-Regular.ttf", fontWeight: 400 },
        { src: "/fonts/v3/MaruBuri-SemiBold.ttf", fontWeight: 600 },
        { src: "/fonts/v3/MaruBuri-Bold.ttf", fontWeight: 700 },
        // italic 요청 시 throw 방지용 alias (마루부리는 italic 없음).
        { src: "/fonts/v3/MaruBuri-Regular.ttf", fontWeight: 400, fontStyle: "italic" },
        { src: "/fonts/v3/MaruBuri-SemiBold.ttf", fontWeight: 600, fontStyle: "italic" },
        { src: "/fonts/v3/MaruBuri-Bold.ttf", fontWeight: 700, fontStyle: "italic" },
      ],
    });
  } catch (err) {
    console.warn("[v3 PDF] MaruBuri registration failed", err);
  }

  try {
    Font.register({
      family: "Old Standard TT",
      fonts: [
        { src: "/fonts/v3/OldStandard-Regular.ttf", fontWeight: 400 },
        { src: "/fonts/v3/OldStandard-Bold.ttf", fontWeight: 700 },
        { src: "/fonts/v3/OldStandard-Italic.ttf", fontWeight: 400, fontStyle: "italic" },
      ],
    });
  } catch (err) {
    console.warn("[v3 PDF] Old Standard TT registration failed", err);
  }

  // Disable hyphenation for Korean
  try {
    Font.registerHyphenationCallback((word) => [word]);
  } catch {
    /* ignore */
  }
}
