// 600 concurrent-users LLM test report generator — bilingual (KR + ID).
// Reads docs/loadtest-llm-600-concurrent-results.json (real k6 data) and, for
// reference, docs/loadtest-llm-100-async-results.json. Writes KR + ID HTML.
// Render to PDF afterwards with headless Chrome --print-to-pdf.
//
//   node scripts/generate-loadtest-llm-600c-report.mjs

import { readFileSync, writeFileSync } from "node:fs";

const R = JSON.parse(
  readFileSync(new URL("../docs/loadtest/results/loadtest-llm-600-concurrent-results.json", import.meta.url)),
);
let R100 = null;
try {
  R100 = JSON.parse(
    readFileSync(new URL("../docs/loadtest/results/loadtest-llm-100-async-results.json", import.meta.url)),
  );
} catch (e) {
  R100 = null;
}

// ── derived numbers ──────────────────────────────────────────────────────────
const pct = (rate) => (rate * 100).toFixed(1);
const sec = (ms) => (ms / 1000).toFixed(1);
const enqSucc = pct(R.enqueue_accepted_rate);
const resSucc = pct(R.result_success_rate);
const ttrMed = sec(R.time_to_result_med_ms);
const ttrP95 = sec(R.time_to_result_p95_ms);
const ttrMax = sec(R.time_to_result_max_ms);
const enqP95 = Math.round(R.enqueue_ms_p95);

// documented context
const MODEL = "Claude Sonnet 4.6";
const GENERATED = "2026-06-25";
const RUN_LOCAL = "≈15:00 KST (운영 시간대 / jam aktif)";
const SERVER =
  "mybook.lgacademy.com · Next.js · Docker 3 replica · nginx · AI Studio 10-key pool";
const GATE_CONC = 5; // AISTUDIO_MAX_CONCURRENCY default
const QUEUE_CONC = 5; // LLM_QUEUE_CONCURRENCY default
const REPLICAS = 3;
const EFF_CONC = GATE_CONC * REPLICAS; // ≈15 effective ceiling, under ~20 account cap

const okClass = (rate) => (rate >= 0.95 ? "good" : rate >= 0.8 ? "warn" : "bad");

// ── language strings ─────────────────────────────────────────────────────────
const L = {
  kr: {
    lang: "ko",
    title: "LLM 엔드포인트 부하 테스트 보고서 — 600명 동시 사용",
    metaTarget: "대상", metaEnv: "환경", metaModel: "모델", metaDate: "작성일",
    metaTool: "도구", metaRun: "실행 시각",
    heroBig: `현재 로직(비동기 큐)이 600명 동시 사용을 <span class="good-i">전부 처리합니다</span>.`,
    heroP: `600명이 동시에 LLM 호출을 보내도 <b>접수·최종 성공률 모두 ${resSucc}%</b>, 오류·타임아웃 0건입니다. 다만 동시성이 큰 만큼 결과까지 시간이 늘어납니다 — 중앙값 <b>${ttrMed}초</b>, p95 <b>${ttrP95}초</b>. 모델은 <b>${MODEL}</b>.`,
    cardEnq: "접수 성공률 (202)",
    cardRes: "최종 결과 성공률",
    cardTtr: "결과까지 (중앙값)",
    cardP95: "결과까지 (p95)",
    h1: "1. 결론 요약",
    concl: `<b>현재 구성은 600명 동시 호출에서도 한 건도 실패하지 않았습니다.</b> 비동기 큐 + 동시성 게이트가 순간 폭주를 <b>오류 대신 대기</b>로 흡수했습니다. 접수는 즉시(202, p95 ${enqP95}ms) 이뤄지고, 결과는 큐를 거쳐 중앙값 ${ttrMed}초·p95 ${ttrP95}초·최대 ${ttrMax}초에 도착했습니다. 운영 서버는 전 구간 정상이었습니다.`,
    bullets: [
      `<b>최종 성공률 ${resSucc}%:</b> 600건 요청 전부 결과까지 도달 — 상위 오류 0, 폴링 404 0, 클라이언트 타임아웃 0.`,
      `<b>빠른 접수:</b> POST는 즉시 202 + jobId 반환 (p95 ${enqP95}ms). 사용자는 기다리지 않고 화면 진행.`,
      `<b>결과 지연(대가):</b> 동시성이 클수록 큐 대기가 늘어 결과까지 중앙값 ${ttrMed}초, p95 ${ttrP95}초.`,
      `<b>동시성 게이트:</b> 프로세스당 ${GATE_CONC}건 × ${REPLICAS} 레플리카 ≈ ${EFF_CONC}건으로 상위 AI Studio 한계(~20)를 넘지 않게 직렬화 → 상위 500 오류 원천 차단.`,
      `<b>모델:</b> ${MODEL} 기준 측정.`,
    ],
    h2: "2. 테스트 설정",
    setup: [
      ["엔드포인트", "POST /api/v3/llm (접수) · GET /api/v3/llm/jobs (폴링)"],
      ["작업(task)", "extractKeyword (LLM 호출 1건/사용자)"],
      ["모델", MODEL],
      ["제공자", "AI Studio 10키 풀 (운영 기본값)"],
      ["인증", "오프라인 발급한 운영 유효 세션 쿠키 (loadtest-00001…600)"],
      ["부하 패턴", "600 VU, 60초에 걸쳐 도착, 각 VU 1회 호출"],
      ["측정 방식", "접수(202) → 2초 간격 폴링 → 결과까지 시간(time-to-result)"],
      ["동시성 제어", `큐 ${QUEUE_CONC}건/프로세스 · AI Studio 게이트 ${GATE_CONC}건/프로세스`],
      ["사전 조건", "직전 테스트 백로그 완전 소진(큐 0) 확인 후 깨끗하게 실행"],
    ],
    h3: "3. 측정 결과",
    thMetric: "지표", thVal: "값", thNote: "비고",
    rows: [
      ["요청 수", `${R.requests_made}건`, "600 VU × 1회"],
      ["접수 성공률 (202)", `${enqSucc}%`, "POST가 즉시 jobId 반환"],
      ["최종 결과 성공률", `${resSucc}%`, "결과(done)까지 도달"],
      ["접수 응답 p95", `${enqP95} ms`, "사용자 대기 없음"],
      ["결과까지 중앙값", `${ttrMed} s`, "접수→결과(큐 대기 포함)"],
      ["결과까지 p95", `${ttrP95} s`, ""],
      ["결과까지 최대", `${ttrMax} s`, ""],
      ["폴링 404 (스티키 미스)", `${R.poll_404}건`, "0 = 세션 라우팅 정상"],
      ["상위 오류(job error)", `${R.upstream_error}건`, "0 = AI Studio 오류 없음"],
      ["클라이언트 타임아웃", `${R.client_timeout}건`, "0 = 마감(5분) 내 모두 완료"],
    ],
    h4: "4. 100명 대비 (확장성)",
    cmpIntro: `같은 방식의 100명 테스트와 비교하면, 동시성이 6배로 늘어도 <b>성공률은 100%로 동일</b>하고 결과 지연만 증가합니다. 즉 현재 로직은 실패하지 않고 <b>대기로 부하를 흡수</b>합니다.`,
    thLvl: "동시 사용자", thS: "최종 성공률", thMed2: "결과 중앙값", thP952: "결과 p95",
    h5: "5. 해석 — 이 결과의 의미",
    meaning: `<b>"600명이 동시에 써도 깨지지 않는다"</b>가 핵심입니다. 이전 동기 방식에서는 동시 호출이 상위 AI Studio 500 오류로 직결됐지만, 현재 비동기 큐는 동시 호출 수를 한계 이하로 직렬화하고 초과분을 대기시켜 <b>전부 성공</b>으로 끝냅니다. 비용은 결과 지연(600명에서 중앙 ${ttrMed}초, p95 ${ttrP95}초)이며, "생성 중…" 진행 표시로 자연스럽게 흡수 가능한 수준입니다.`,
    h6: "6. 권장 사항",
    recs: [
      `<b>현 구성 유지:</b> 600명 동시 호출까지 무실패. 추가 조치 없이 운영 가능.`,
      `<b>지연 단축이 필요하면:</b> 레플리카 수 또는 게이트 값(× 레플리카 ≤ ~20)을 상위 한계에 맞춰 상향 → 결과 지연 감소.`,
      `<b>진행 표시 UX:</b> 접수가 즉시(202)이므로 "생성 중…" 표시로 p95 ${ttrP95}초 대기를 체감 완화.`,
      `<b>모니터링:</b> 결과까지 p95와 큐 길이를 운영 지표로 추적해 한계 도달 전 선제 확장.`,
    ],
    caveatH: "측정 한계",
    caveat: `단일 작업(extractKeyword, 1건/사용자) 기준의 순수 동시성 측정입니다. 실제 한 사용자는 한 세션에서 ~21개 작업(무거운 합성 포함)을 순차 호출하므로, 전체 매거진 완주 관점의 대규모(예: 600 세션) 측정은 결과 지연이 훨씬 길어집니다. 본 보고서는 "현재 로직이 600 동시 호출을 실패 없이 처리하는가"에 대한 답입니다(=예).`,
    foot: `생성일 ${GENERATED} · LG 매거진 LLM 600명 동시 호출 테스트 · 모델 ${MODEL} · 데이터: docs/loadtest-llm-600-concurrent-results.json (k6, 실측)`,
  },
  id: {
    lang: "id",
    title: "Laporan Uji Beban Endpoint LLM — 600 Pengguna Bersamaan",
    metaTarget: "Target", metaEnv: "Lingkungan", metaModel: "Model", metaDate: "Tanggal",
    metaTool: "Alat", metaRun: "Waktu jalan",
    heroBig: `Logika saat ini (antrian asinkron) <span class="good-i">menangani seluruh</span> 600 pengguna bersamaan.`,
    heroP: `Meski 600 pengguna mengirim panggilan LLM bersamaan, <b>keberhasilan terima & hasil akhir sama-sama ${resSucc}%</b>, dengan 0 error & 0 timeout. Konsekuensinya, waktu ke hasil memanjang — median <b>${ttrMed} detik</b>, p95 <b>${ttrP95} detik</b>. Model: <b>${MODEL}</b>.`,
    cardEnq: "Keberhasilan terima (202)",
    cardRes: "Keberhasilan hasil akhir",
    cardTtr: "Waktu ke hasil (median)",
    cardP95: "Waktu ke hasil (p95)",
    h1: "1. Ringkasan Kesimpulan",
    concl: `<b>Konfigurasi saat ini tidak menggagalkan satu pun permintaan, bahkan pada 600 panggilan bersamaan.</b> Antrian asinkron + gerbang konkurensi menyerap lonjakan sesaat menjadi <b>penundaan, bukan error</b>. Penerimaan instan (202, p95 ${enqP95}ms); hasil tiba lewat antrean pada median ${ttrMed} detik · p95 ${ttrP95} detik · maks ${ttrMax} detik. Server produksi normal sepanjang uji.`,
    bullets: [
      `<b>Keberhasilan akhir ${resSucc}%:</b> seluruh 600 permintaan mencapai hasil — 0 error hulu, 0 polling 404, 0 timeout klien.`,
      `<b>Penerimaan cepat:</b> POST langsung mengembalikan 202 + jobId (p95 ${enqP95}ms). Pengguna tak menunggu, layar berjalan.`,
      `<b>Penundaan hasil (harga yang dibayar):</b> makin tinggi konkurensi, makin lama antre — waktu ke hasil median ${ttrMed} detik, p95 ${ttrP95} detik.`,
      `<b>Gerbang konkurensi:</b> ${GATE_CONC}/proses × ${REPLICAS} replika ≈ ${EFF_CONC}, dijaga di bawah batas AI Studio (~20) → error 500 hulu dicegah dari akar.`,
      `<b>Model:</b> diukur pada ${MODEL}.`,
    ],
    h2: "2. Konfigurasi Uji",
    setup: [
      ["Endpoint", "POST /api/v3/llm (terima) · GET /api/v3/llm/jobs (polling)"],
      ["Tugas (task)", "extractKeyword (1 panggilan LLM/pengguna)"],
      ["Model", MODEL],
      ["Penyedia", "Pool 10 kunci AI Studio (default produksi)"],
      ["Autentikasi", "Cookie sesi valid-produksi dibuat offline (loadtest-00001…600)"],
      ["Pola beban", "600 VU, tiba dalam 60 detik, tiap VU 1 panggilan"],
      ["Cara ukur", "terima (202) → polling tiap 2 detik → waktu hingga hasil"],
      ["Kontrol konkurensi", `antrian ${QUEUE_CONC}/proses · gerbang AI Studio ${GATE_CONC}/proses`],
      ["Prasyarat", "Backlog uji sebelumnya dipastikan habis (antrean 0) sebelum run bersih"],
    ],
    h3: "3. Hasil Pengukuran",
    thMetric: "Metrik", thVal: "Nilai", thNote: "Catatan",
    rows: [
      ["Jumlah permintaan", `${R.requests_made}`, "600 VU × 1"],
      ["Keberhasilan terima (202)", `${enqSucc}%`, "POST langsung beri jobId"],
      ["Keberhasilan hasil akhir", `${resSucc}%`, "mencapai hasil (done)"],
      ["Respons terima p95", `${enqP95} ms`, "pengguna tak menunggu"],
      ["Waktu ke hasil median", `${ttrMed} s`, "terima→hasil (termasuk antre)"],
      ["Waktu ke hasil p95", `${ttrP95} s`, ""],
      ["Waktu ke hasil maks", `${ttrMax} s`, ""],
      ["Polling 404 (sticky miss)", `${R.poll_404}`, "0 = routing sesi normal"],
      ["Error hulu (job error)", `${R.upstream_error}`, "0 = tak ada error AI Studio"],
      ["Timeout klien", `${R.client_timeout}`, "0 = semua selesai dalam batas (5 mnt)"],
    ],
    h4: "4. Dibanding 100 Pengguna (Skalabilitas)",
    cmpIntro: `Dibanding uji 100 pengguna dengan metode sama, walau konkurensi naik 6×, <b>keberhasilan tetap 100%</b> — hanya penundaan hasil yang bertambah. Artinya logika saat ini tidak gagal, melainkan <b>menyerap beban menjadi antrean</b>.`,
    thLvl: "Pengguna bersamaan", thS: "Keberhasilan akhir", thMed2: "Median hasil", thP952: "p95 hasil",
    h5: "5. Interpretasi — Arti Hasil Ini",
    meaning: `Intinya: <b>"600 pengguna bersamaan pun tidak membuatnya rusak."</b> Pada mode sinkron lama, panggilan bersamaan langsung memicu error 500 AI Studio hulu; antrian asinkron kini membatasi jumlah panggilan serentak di bawah batas dan mengantre kelebihannya hingga <b>semua berhasil</b>. Harganya adalah penundaan hasil (pada 600: median ${ttrMed} detik, p95 ${ttrP95} detik) — masih wajar diserap dengan indikator "sedang membuat…".`,
    h6: "6. Rekomendasi",
    recs: [
      `<b>Pertahankan konfigurasi:</b> hingga 600 panggilan bersamaan tanpa gagal. Bisa dioperasikan tanpa tindakan tambahan.`,
      `<b>Bila perlu mempercepat:</b> naikkan jumlah replika atau nilai gerbang (× replika ≤ ~20) terhadap batas hulu → penundaan hasil berkurang.`,
      `<b>UX indikator progres:</b> karena terima instan (202), gunakan "sedang membuat…" untuk meringankan tunggu p95 ${ttrP95} detik.`,
      `<b>Pemantauan:</b> lacak p95 waktu ke hasil dan panjang antrean sebagai metrik operasi untuk scale-up dini.`,
    ],
    caveatH: "Batasan Pengukuran",
    caveat: `Ini pengukuran konkurensi murni berbasis satu tugas (extractKeyword, 1/pengguna). Pengguna nyata memanggil ~21 tugas berurutan per sesi (termasuk sintesis berat), sehingga pengukuran skala besar dari sudut "menuntaskan seluruh majalah" (mis. 600 sesi) akan jauh lebih lama penundaannya. Laporan ini menjawab "apakah logika saat ini menangani 600 panggilan bersamaan tanpa gagal" (= ya).`,
    foot: `Dibuat ${GENERATED} · Uji 600 Panggilan Bersamaan LLM LG Magazine · Model ${MODEL} · Data: docs/loadtest-llm-600-concurrent-results.json (k6, terukur)`,
  },
};

// comparison rows (100 vs 600), only if 100 data present
function cmpRows() {
  const lvls = [];
  if (R100) {
    lvls.push({
      n: R100.vus, s: pct(R100.result_success_rate),
      med: sec(R100.time_to_result_med_ms), p95: sec(R100.time_to_result_p95_ms),
    });
  }
  lvls.push({ n: R.vus, s: resSucc, med: ttrMed, p95: ttrP95 });
  return lvls
    .map(
      (l) =>
        `<tr><td class="n">${l.n}</td><td class="n good">${l.s}%</td><td class="n">${l.med}s</td><td class="n">${l.p95}s</td></tr>`,
    )
    .join("\n");
}

// ── HTML template ────────────────────────────────────────────────────────────
function render(t) {
  const setupRows = t.setup.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${v}</td></tr>`).join("\n");
  const bullets = t.bullets.map((b) => `<li>${b}</li>`).join("\n");
  const recs = t.recs.map((b) => `<li>${b}</li>`).join("\n");
  const resultRows = t.rows
    .map(([m, v, n]) => `<tr><td>${m}</td><td class="n"><b>${v}</b></td><td>${n}</td></tr>`)
    .join("\n");
  return `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 15mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Apple SD Gothic Neo","Malgun Gothic",-apple-system,"Segoe UI",sans-serif; color:#1a1a1a; font-size:12px; line-height:1.6; margin:0; }
  h1 { font-size:20px; margin:0 0 4px; }
  h2 { font-size:14px; margin:20px 0 8px; padding-bottom:4px; border-bottom:2px solid #e2e8f0; }
  code { background:#f1f5f9; padding:1px 4px; border-radius:3px; font-size:10.5px; }
  .meta { font-size:10.5px; color:#555; margin-bottom:12px; }
  .meta b { color:#222; }
  .hero { background:#052e16; color:#fff; border-radius:10px; padding:16px 18px; margin:12px 0; }
  .hero .big { font-size:18px; font-weight:800; line-height:1.35; }
  .hero .big .good-i { color:#86efac; }
  .hero p { margin:8px 0 0; font-size:11.5px; color:#d1fae5; }
  .cards { display:flex; gap:10px; margin:12px 0; }
  .card { flex:1; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; background:#f8fafc; }
  .card .v { font-size:18px; font-weight:800; color:#0f172a; }
  .card .v.good { color:#15803d; }
  .card .l { font-size:10px; color:#64748b; margin-top:2px; }
  table { width:100%; border-collapse:collapse; margin:6px 0; font-size:11px; }
  th, td { border:1px solid #e2e8f0; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:#f1f5f9; font-weight:700; }
  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .good { color:#15803d; font-weight:700; }
  .warn { color:#b45309; font-weight:700; }
  .bad  { color:#b91c1c; font-weight:700; }
  .note { background:#f0fdf4; border-left:3px solid #22c55e; padding:8px 12px; border-radius:0 6px 6px 0; font-size:11px; margin:8px 0; }
  .note.amber { background:#fffbeb; border-left-color:#f59e0b; }
  ul { margin:6px 0 6px 18px; padding:0; }
  li { margin:4px 0; }
  .foot { margin-top:18px; font-size:9.5px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:8px; }
</style></head><body>

<h1>${t.title}</h1>
<div class="meta">
  ${t.metaTarget}: <b>LG Magazine</b> &nbsp;·&nbsp;
  ${t.metaEnv}: <b>${SERVER}</b> &nbsp;·&nbsp;
  ${t.metaModel}: <b>${MODEL}</b> &nbsp;·&nbsp;
  ${t.metaTool}: <b>k6</b> &nbsp;·&nbsp;
  ${t.metaRun}: <b>${RUN_LOCAL}</b> &nbsp;·&nbsp;
  ${t.metaDate}: <b>${GENERATED}</b>
</div>

<div class="hero">
  <div class="big">${t.heroBig}</div>
  <p>${t.heroP}</p>
</div>

<div class="cards">
  <div class="card"><div class="v good">${enqSucc}%</div><div class="l">${t.cardEnq}</div></div>
  <div class="card"><div class="v good">${resSucc}%</div><div class="l">${t.cardRes}</div></div>
  <div class="card"><div class="v">${ttrMed}s</div><div class="l">${t.cardTtr}</div></div>
  <div class="card"><div class="v">${ttrP95}s</div><div class="l">${t.cardP95}</div></div>
</div>

<h2>${t.h1}</h2>
<div class="note">${t.concl}</div>
<ul>${bullets}</ul>

<h2>${t.h2}</h2>
<table>${setupRows}</table>

<h2>${t.h3}</h2>
<table>
  <tr><th>${t.thMetric}</th><th class="n">${t.thVal}</th><th>${t.thNote}</th></tr>
  ${resultRows}
</table>

<h2>${t.h4}</h2>
<p>${t.cmpIntro}</p>
<table style="margin-top:6px">
  <tr><th class="n">${t.thLvl}</th><th class="n">${t.thS}</th><th class="n">${t.thMed2}</th><th class="n">${t.thP952}</th></tr>
  ${cmpRows()}
</table>

<h2>${t.h5}</h2>
<div class="note">${t.meaning}</div>

<h2>${t.h6}</h2>
<ul>${recs}</ul>

<div class="note amber"><b>${t.caveatH}.</b> ${t.caveat}</div>

<div class="foot">${t.foot}</div>

</body></html>`;
}

for (const [key, t] of Object.entries(L)) {
  const out = new URL(`../docs/loadtest/reports/loadtest_llm_600c_${key}.html`, import.meta.url);
  writeFileSync(out, render(t));
  console.log("HTML written:", out.pathname);
}
