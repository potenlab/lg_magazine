// Root-cause CONFIRMATION (one page, bilingual KR + ID).
// States the confirmed cause of the LLM endpoint failing at scale, with the
// concurrency-sweep evidence and the three code-level facts.
//   node scripts/generate-rootcause-confirmation.mjs
// then render with headless Chrome --print-to-pdf.

import { readFileSync, writeFileSync } from "node:fs";

const D = JSON.parse(readFileSync(new URL("../docs/loadtest/results/llm-rootcause-confirmation.json", import.meta.url)));
const GENERATED = "2026-06-19";
const CEIL = D.concurrency_ceiling;

function sweepRows() {
  return D.sweep.map((r) => {
    const cls = r.ok_pct >= 95 ? "good" : r.ok_pct >= 60 ? "warn" : "bad";
    return `<tr><td class="n">${r.conc}</td><td class="n ${cls}">${r.ok_pct}%</td><td class="n">${r.overload}</td></tr>`;
  }).join("\n");
}

const L = {
  kr: {
    lang: "ko",
    title: "원인 확정 — LLM 600명 동시 사용 실패",
    sub: "왜 이런 현상이 일어나는가 (확정)",
    metaDate: "작성일", metaTool: "근거", metaToolV: "프로덕션 동시성 스윕(k6 + curl) + 코드 분석",
    verdictH: "확정 결론",
    verdict: `매거진의 모든 AI 단계는 <b>하나의 LG AI Studio 계정</b>을 통해 호출됩니다. 이 계정은 <b>동시에 약 ${CEIL}건</b>까지만 처리할 수 있습니다. 그 이상이 한꺼번에 몰리면 초과분은 대기열에 들어가지 않고 즉시 <code>500 "오류가 발생했습니다"</code>로 거절됩니다. 앱에는 이 동시성을 제어하는 <b>대기열(큐)도, 재시도도 없습니다.</b> 따라서 600명이 동시에 사용하면 약 ${CEIL}건만 성공하고 나머지는 실패합니다.`,
    evH: "근거 — 동시성 스윕 (프로덕션 실측)",
    evP: `동시 요청 수를 올리며 측정한 결과: <b>${CEIL}건까지는 100% 성공</b>, 그 이상부터 거절(500)이 시작되고 <b>성공 건수는 약 ${CEIL}에서 더 늘지 않습니다.</b> 부하를 더 줘도 성공은 그대로, 초과분만 전부 실패합니다.`,
    thConc: "동시 요청", thOk: "성공률", thOver: "거절(500)",
    whyH: "왜 10개 API 키 로테이션으로 해결이 안 되는가",
    why: [
      `<b>로테이션은 다른 문제를 위한 것:</b> 키 로테이션은 <b>토큰 사용량(일/분 한도)</b>을 분산하기 위한 장치입니다. 지금 문제는 <b>동시 처리량</b>으로, 전혀 다른 한계입니다.`,
      `<b>이 오류에는 로테이션이 작동조차 안 함:</b> 코드상 토큰 한도 메시지일 때만 다음 키로 넘어가고, 그 외 500은 <b>즉시 throw</b> — 재시도·전환 없음 (aistudio.ts).`,
      `<b>설령 넘어가도 소용없음:</b> 10개 키(LG_BOOK_01~10)는 <b>같은 계정·같은 토큰·같은 주소</b>를 공유합니다. 같은 ${CEIL} 동시성 문을 두드릴 뿐입니다. 실측에서도 10키에 고루 분산했음에도 성공이 ${CEIL}에서 멈췄습니다(키당 한도였다면 ~200이어야 함).`,
    ],
    analogyH: "비유",
    analogy: `LLM 제공자는 <b>한 번에 20개 요리만 만드는 주방</b>입니다. 10개 키는 <b>결제 카드 10장</b>일 뿐 — 카드(토큰 한도)를 바꿔도 주방(동시 처리량)은 그대로입니다. 600명이 동시에 주문하면 20개만 나오고 나머지는 "주방 꽉 참"으로 반려됩니다.`,
    fixH: "해결 방향",
    fix: [
      `<b>서버측 큐(동시성 상한):</b> 업스트림 동시 호출을 약 15~18로 제한하고 초과분을 <b>대기</b>시킴 — 실패 대신 순번 대기. (프론트가 아닌 서버에서만 가능 — 전체 사용자 트래픽을 서버만 알기 때문.)`,
      `<b>재시도(백오프):</b> 이 500은 일시적 — 2~3회 지수 백오프 재시도로 상당수 회복.`,
      `<b>제공자 한도 상향:</b> LG AI Studio에 동시 처리 한도 상향 또는 <b>별도 계정</b> 요청 — 진짜로 ${CEIL} 이상 동시에 받는 유일한 길.`,
      `<b>프론트 완화:</b> 한 사용자가 여러 호출을 <b>병렬로 쏘지 않기</b>(챕터 기사 4건 직렬화), 생성 중 대기 UX.`,
    ],
    foot: `확정일 ${GENERATED} · LG 매거진 LLM 원인 확정 · 근거: 프로덕션 동시성 스윕 + src/lib/llm/providers/aistudio.ts`,
  },
  id: {
    lang: "id",
    title: "Konfirmasi Akar Masalah — Kegagalan LLM untuk 600 Pengguna",
    sub: "Mengapa hal ini terjadi (terkonfirmasi)",
    metaDate: "Tanggal", metaTool: "Dasar", metaToolV: "Sweep konkurensi produksi (k6 + curl) + analisis kode",
    verdictH: "Kesimpulan Terkonfirmasi",
    verdict: `Setiap langkah AI di majalah memanggil <b>satu akun LG AI Studio</b>. Akun ini hanya mampu memproses <b>±${CEIL} permintaan secara bersamaan</b>. Bila lebih dari itu datang serentak, kelebihannya tidak diantrekan melainkan langsung ditolak dengan <code>500 "terjadi kesalahan"</code>. Aplikasi <b>tidak punya antrian maupun retry</b> untuk konkurensi ini. Maka pada 600 pengguna serentak, hanya ±${CEIL} yang berhasil, sisanya gagal.`,
    evH: "Bukti — Sweep Konkurensi (pengukuran produksi)",
    evP: `Dengan menaikkan jumlah permintaan bersamaan: <b>hingga ${CEIL} = 100% sukses</b>, di atas itu penolakan (500) mulai muncul, dan <b>jumlah sukses berhenti di ±${CEIL}.</b> Beban ditambah pun sukses tetap sama, kelebihan semuanya gagal.`,
    thConc: "Permintaan bersamaan", thOk: "Keberhasilan", thOver: "Ditolak (500)",
    whyH: "Mengapa rotasi 10 kunci API tidak menyelesaikannya",
    why: [
      `<b>Rotasi untuk masalah lain:</b> Rotasi kunci membagi <b>kuota token (batas harian/menit)</b>. Masalah sekarang adalah <b>konkurensi</b> — batas yang sama sekali berbeda.`,
      `<b>Rotasi bahkan tidak aktif untuk error ini:</b> Pada kode, perpindahan kunci hanya terjadi saat pesan batas token; 500 lain <b>langsung dilempar</b> — tanpa retry/perpindahan (aistudio.ts).`,
      `<b>Andai pun pindah, percuma:</b> 10 kunci (LG_BOOK_01–10) berbagi <b>akun, token, dan alamat yang sama</b>. Hanya mengetuk pintu ${CEIL}-konkurensi yang sama. Terbukti: beban tersebar merata ke 10 kunci pun sukses berhenti di ${CEIL} (bila per-kunci, harusnya ~200).`,
    ],
    analogyH: "Analogi",
    analogy: `Penyedia LLM ibarat <b>dapur yang hanya memasak 20 hidangan sekaligus</b>. 10 kunci hanyalah <b>10 kartu pembayaran</b> — ganti kartu (kuota token) tidak mengubah kapasitas dapur (konkurensi). 600 orang pesan serentak: 20 jadi, sisanya ditolak "dapur penuh".`,
    fixH: "Arah Perbaikan",
    fix: [
      `<b>Antrian sisi server (batas konkurensi):</b> Batasi panggilan hulu ke ±15–18 dan <b>antrekan</b> kelebihannya — menunggu giliran, bukan gagal. (Hanya bisa di server, bukan frontend — hanya server melihat trafik semua pengguna.)`,
      `<b>Retry (backoff):</b> 500 ini bersifat sementara — retry 2–3× dengan backoff memulihkan banyak.`,
      `<b>Naikkan batas penyedia:</b> Minta LG AI Studio menaikkan batas konkurensi atau <b>akun terpisah</b> — satu-satunya cara benar-benar melayani >${CEIL} serentak.`,
      `<b>Mitigasi frontend:</b> Jangan kirim banyak panggilan <b>paralel</b> per pengguna (serialkan 4 artikel bab), beri UX menunggu saat generasi.`,
    ],
    foot: `Dikonfirmasi ${GENERATED} · Akar Masalah LLM LG Magazine · Dasar: sweep konkurensi produksi + src/lib/llm/providers/aistudio.ts`,
  },
};

function render(t) {
  const why = t.why.map((x) => `<li>${x}</li>`).join("\n");
  const fix = t.fix.map((x) => `<li>${x}</li>`).join("\n");
  return `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 15mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Apple SD Gothic Neo","Malgun Gothic",-apple-system,"Segoe UI",sans-serif; color:#1a1a1a; font-size:12px; line-height:1.62; margin:0; }
  h1 { font-size:20px; margin:0 0 2px; }
  .sub { font-size:12px; color:#475569; margin:0 0 8px; font-weight:700; }
  h2 { font-size:13.5px; margin:18px 0 7px; padding-bottom:4px; border-bottom:2px solid #e2e8f0; }
  code { background:#f1f5f9; padding:1px 4px; border-radius:3px; font-size:10.5px; }
  .meta { font-size:10.5px; color:#555; margin-bottom:10px; }
  .meta b { color:#222; }
  .verdict { background:#0f172a; color:#fff; border-radius:10px; padding:15px 17px; margin:10px 0; }
  .verdict .h { font-size:12px; font-weight:800; color:#fca5a5; letter-spacing:.3px; margin-bottom:5px; }
  .verdict p { margin:0; font-size:12.5px; color:#e2e8f0; line-height:1.6; }
  .verdict code { background:#1e293b; color:#fecaca; }
  table { width:100%; border-collapse:collapse; margin:6px 0; font-size:11px; }
  th, td { border:1px solid #e2e8f0; padding:6px 8px; text-align:left; }
  th { background:#f1f5f9; font-weight:700; }
  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .good { color:#15803d; font-weight:700; } .warn { color:#b45309; font-weight:700; } .bad { color:#b91c1c; font-weight:700; }
  .note { background:#eff6ff; border-left:3px solid #3b82f6; padding:8px 12px; border-radius:0 6px 6px 0; font-size:11px; margin:8px 0; }
  .amber { background:#fffbeb; border-left:3px solid #f59e0b; padding:8px 12px; border-radius:0 6px 6px 0; font-size:11px; margin:8px 0; }
  ul { margin:6px 0 6px 18px; padding:0; }
  li { margin:5px 0; }
  .foot { margin-top:16px; font-size:9.5px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:8px; }
</style></head><body>

<h1>${t.title}</h1>
<div class="sub">${t.sub}</div>
<div class="meta">${t.metaTool}: <b>${t.metaToolV}</b> &nbsp;·&nbsp; ${t.metaDate}: <b>${GENERATED}</b></div>

<div class="verdict">
  <div class="h">${t.verdictH}</div>
  <p>${t.verdict}</p>
</div>

<h2>${t.evH}</h2>
<p>${t.evP}</p>
<table>
  <tr><th class="n">${t.thConc}</th><th class="n">${t.thOk}</th><th class="n">${t.thOver}</th></tr>
  ${sweepRows()}
</table>

<h2>${t.whyH}</h2>
<ul>${why}</ul>
<div class="note">${t.analogyH}: ${t.analogy}</div>

<h2>${t.fixH}</h2>
<ul>${fix}</ul>

<div class="foot">${t.foot}</div>
</body></html>`;
}

for (const [key, t] of Object.entries(L)) {
  const out = new URL(`../docs/loadtest/reports/llm_rootcause_confirmation_${key}.html`, import.meta.url);
  writeFileSync(out, render(t));
  console.log("HTML written:", out.pathname);
}
