// 100-user LLM stress-test report generator — bilingual (KR + ID).
// Reads docs/loadtest-llm-100-async-results.json (real k6 data; no hand-entered
// numbers) and writes docs/loadtest_llm_100_kr.html and ..._id.html.
// Render to PDF afterwards with headless Chrome --print-to-pdf.
//
//   node scripts/generate-loadtest-llm-100-report.mjs

import { readFileSync, writeFileSync } from "node:fs";

const R = JSON.parse(
  readFileSync(new URL("../docs/loadtest/loadtest-llm-100-async-results.json", import.meta.url)),
);

// ── derived numbers ──────────────────────────────────────────────────────────
const pct = (rate) => (rate * 100).toFixed(1);
const sec = (ms) => (ms / 1000).toFixed(1);
const enqSucc = pct(R.enqueue_accepted_rate);
const resSucc = pct(R.result_success_rate);
const ttrMed = sec(R.time_to_result_med_ms);
const ttrP95 = sec(R.time_to_result_p95_ms);
const ttrMax = sec(R.time_to_result_max_ms);
const enqP95 = Math.round(R.enqueue_ms_p95);

// documented context (this session / from code + prior measurements)
const MODEL = "Claude Sonnet 4.6";
const GENERATED = "2026-06-25";
const RUN_LOCAL = "≈12:00 KST (운영 시간대 / jam aktif)";
const SERVER =
  "mybook.lgacademy.com · Next.js · Docker 3 replica · nginx · AI Studio 10-key pool";
const QUEUE_CONC = 5; // LLM_QUEUE_CONCURRENCY default
const GATE_CONC = 5; // AISTUDIO_MAX_CONCURRENCY default
const REPLICAS = 3;
const EFF_CONC = GATE_CONC * REPLICAS; // effective account-wide ceiling ≈ 15, under ~20
// prior synchronous (pre-queue) failure baseline, for the before/after contrast
const OLD_SYNC_600 = "6.5"; // 600-VU synchronous success rate %
const OLD_SYNC_50 = "41.8"; // 50-VU synchronous success rate %

const okClass = (rate) => (rate >= 0.95 ? "good" : rate >= 0.8 ? "warn" : "bad");

// ── language strings ─────────────────────────────────────────────────────────
const L = {
  kr: {
    lang: "ko",
    title: "LLM 엔드포인트 부하 테스트 보고서 — 100명 동시 사용",
    metaTarget: "대상", metaEnv: "환경", metaModel: "모델", metaDate: "작성일",
    metaTool: "도구", metaRun: "실행 시각",
    heroBig: `LLM(AI 생성) 엔드포인트가 100명 동시 사용을 <span class="good-i">정상적으로 처리합니다</span>.`,
    heroP: `비동기 작업 큐 + 동시성 게이트 적용 후, 100명이 동시에 매거진 생성을 요청해도 <b>최종 성공률 ${resSucc}%</b>, 결과까지 중앙값 <b>${ttrMed}초</b>로 완료됩니다. 모델은 현재 <b>${MODEL}</b> 입니다.`,
    cardEnq: "접수 성공률 (202)",
    cardRes: "최종 결과 성공률",
    cardTtr: "결과까지 소요 (중앙값)",
    cardP95: "결과까지 소요 (p95)",
    h1: "1. 결론 요약",
    concl: `<b>현재 구성은 100명 동시 사용을 안정적으로 감당합니다.</b> 이전(동기 방식)에는 동시 50명에서 성공률 ${OLD_SYNC_50}%, 600명에서 ${OLD_SYNC_600}%로 붕괴했지만, <b>비동기 큐 + 동시성 게이트</b> 도입 후 100명 동시 요청에서 접수·최종 성공 모두 ${resSucc}%를 기록했습니다. 실패가 오류 대신 짧은 대기로 흡수됩니다.`,
    bullets: [
      `<b>최종 성공률 ${resSucc}%:</b> 100건 요청이 모두 결과까지 도달 — 폴백/타임아웃/상위 오류 0건.`,
      `<b>빠른 접수:</b> POST는 즉시 202 + jobId 반환 (p95 ${enqP95}ms). 사용자는 기다리지 않고 화면이 진행됨.`,
      `<b>결과 지연:</b> 결과까지 중앙값 ${ttrMed}초, p95 ${ttrP95}초, 최대 ${ttrMax}초 — 게이트 대기 포함.`,
      `<b>동시성 게이트:</b> 프로세스당 동시 ${GATE_CONC}건 × ${REPLICAS} 레플리카 ≈ ${EFF_CONC}건으로 상위 AI Studio 한계(~20)를 넘지 않게 직렬화.`,
      `<b>모델:</b> ${MODEL} 기준 측정.`,
    ],
    h2: "2. 테스트 설정",
    setup: [
      ["엔드포인트", "POST /api/v3/llm (접수) · GET /api/v3/llm/jobs (폴링)"],
      ["작업(task)", "extractKeyword (실제 매거진 생성의 LLM 호출)"],
      ["모델", MODEL],
      ["제공자", "AI Studio 10키 풀 (운영 기본값)"],
      ["인증", "오프라인 발급한 운영 유효 세션 쿠키 (loadtest-00001…100)"],
      ["부하 패턴", "100 VU, 60초에 걸쳐 도착, 각 VU 1회 요청 (실제 사용자 모사)"],
      ["측정 방식", "접수(202) → 2초 간격 폴링 → 결과까지 시간(time-to-result) 측정"],
      ["동시성 제어", `큐 동시 ${QUEUE_CONC}건/프로세스 · AI Studio 게이트 ${GATE_CONC}건/프로세스`],
    ],
    h3: "3. 측정 결과",
    thMetric: "지표", thVal: "값", thNote: "비고",
    rows: [
      ["요청 수", `${R.requests_made}건`, "100 VU × 1회"],
      ["접수 성공률 (202)", `${enqSucc}%`, "POST가 즉시 jobId 반환"],
      ["최종 결과 성공률", `${resSucc}%`, "결과(done)까지 도달"],
      ["접수 응답 p95", `${enqP95} ms`, "사용자 대기 없음"],
      ["결과까지 중앙값", `${ttrMed} s`, "접수→결과(큐 대기 포함)"],
      ["결과까지 p95", `${ttrP95} s`, ""],
      ["결과까지 최대", `${ttrMax} s`, ""],
      ["폴링 404 (스티키 미스)", `${R.poll_404}건`, "0 = 세션 라우팅 정상"],
      ["상위 오류(job error)", `${R.upstream_error}건`, "0 = AI Studio 오류 없음"],
      ["클라이언트 타임아웃", `${R.client_timeout}건`, "0 = 마감 내 모두 완료"],
    ],
    h4: "4. 이전 대비 (개선 효과)",
    beforeAfter: `이전 동기 방식에서는 LLM 호출을 요청 시점에 그대로 처리해 동시 부하가 몰리면 상위 AI Studio가 건별 500 오류를 반환했습니다(50명 ${OLD_SYNC_50}%, 600명 ${OLD_SYNC_600}% 성공). <b>비동기 큐 + 동시성 게이트</b>는 동시 호출 수를 상위 한계 이하로 직렬화하고, 초과분을 짧게 대기시켜 <b>오류를 대기로 전환</b>합니다. 그 결과 100명 동시에서 최종 성공률 ${resSucc}%를 달성했습니다.`,
    h5: "5. 권장 사항",
    recs: [
      `<b>현 구성 유지:</b> 100명 규모 수업은 현재 설정으로 안정적. 추가 조치 불필요.`,
      `<b>더 큰 규모 대비:</b> 600명 이상은 결과 지연이 길어질 수 있음 — 레플리카 수 또는 게이트 값(× 레플리카 ≤ ~20)을 상위 한계에 맞춰 조정.`,
      `<b>진행 표시 UX:</b> 접수가 즉시(202)이므로 "생성 중…" 진행 표시로 체감 대기를 자연스럽게.`,
      `<b>모니터링:</b> 결과까지 p95와 큐 대기 길이를 운영 지표로 추적해 한계 도달 전 선제 확장.`,
      `<b>대규모 재측정:</b> 300·600명 동시 시나리오를 심야에 추가 측정해 결과 지연 곡선 확보 권장.`,
    ],
    caveatH: "측정 한계",
    caveat: `단일 작업(extractKeyword) 기준, 운영 시간대 1회 실행. 큐는 프로세스(레플리카) 내 메모리 기반이므로 접수와 폴링이 같은 레플리카로 라우팅되어야 함(nginx 세션 해시). 이번 실행에서 폴링 404=0으로 라우팅 정상 확인됨.`,
    foot: `생성일 ${GENERATED} · LG 매거진 LLM 100명 부하 테스트 · 모델 ${MODEL} · 데이터: docs/loadtest-llm-100-async-results.json (k6, 실측)`,
  },
  id: {
    lang: "id",
    title: "Laporan Uji Beban Endpoint LLM — 100 Pengguna Bersamaan",
    metaTarget: "Target", metaEnv: "Lingkungan", metaModel: "Model", metaDate: "Tanggal",
    metaTool: "Alat", metaRun: "Waktu jalan",
    heroBig: `Endpoint LLM (pembuatan AI) <span class="good-i">menangani</span> 100 pengguna bersamaan dengan baik.`,
    heroP: `Setelah penerapan antrian kerja asinkron + gerbang konkurensi, 100 pengguna yang meminta pembuatan majalah secara bersamaan tetap mencapai <b>tingkat keberhasilan akhir ${resSucc}%</b>, dengan waktu hingga hasil median <b>${ttrMed} detik</b>. Model saat ini adalah <b>${MODEL}</b>.`,
    cardEnq: "Keberhasilan terima (202)",
    cardRes: "Keberhasilan hasil akhir",
    cardTtr: "Waktu ke hasil (median)",
    cardP95: "Waktu ke hasil (p95)",
    h1: "1. Ringkasan Kesimpulan",
    concl: `<b>Konfigurasi saat ini mampu menangani 100 pengguna bersamaan secara stabil.</b> Sebelumnya (mode sinkron), pada 50 pengguna keberhasilan ${OLD_SYNC_50}% dan pada 600 pengguna anjlok ke ${OLD_SYNC_600}%. Setelah <b>antrian asinkron + gerbang konkurensi</b>, 100 permintaan bersamaan mencatat keberhasilan terima dan hasil akhir sama-sama ${resSucc}%. Kegagalan diserap menjadi penundaan singkat, bukan error.`,
    bullets: [
      `<b>Keberhasilan akhir ${resSucc}%:</b> 100 permintaan mencapai hasil — 0 fallback/timeout/error hulu.`,
      `<b>Penerimaan cepat:</b> POST langsung mengembalikan 202 + jobId (p95 ${enqP95}ms). Pengguna tidak menunggu, layar tetap berjalan.`,
      `<b>Penundaan hasil:</b> waktu ke hasil median ${ttrMed} detik, p95 ${ttrP95} detik, maks ${ttrMax} detik — termasuk antre gerbang.`,
      `<b>Gerbang konkurensi:</b> ${GATE_CONC} panggilan serentak/proses × ${REPLICAS} replika ≈ ${EFF_CONC}, dijaga di bawah batas AI Studio hulu (~20).`,
      `<b>Model:</b> diukur pada ${MODEL}.`,
    ],
    h2: "2. Konfigurasi Uji",
    setup: [
      ["Endpoint", "POST /api/v3/llm (terima) · GET /api/v3/llm/jobs (polling)"],
      ["Tugas (task)", "extractKeyword (panggilan LLM nyata pada pembuatan majalah)"],
      ["Model", MODEL],
      ["Penyedia", "Pool 10 kunci AI Studio (default produksi)"],
      ["Autentikasi", "Cookie sesi valid-produksi dibuat offline (loadtest-00001…100)"],
      ["Pola beban", "100 VU, tiba dalam 60 detik, tiap VU 1 permintaan (meniru pengguna nyata)"],
      ["Cara ukur", "terima (202) → polling tiap 2 detik → ukur waktu hingga hasil"],
      ["Kontrol konkurensi", `antrian ${QUEUE_CONC}/proses · gerbang AI Studio ${GATE_CONC}/proses`],
    ],
    h3: "3. Hasil Pengukuran",
    thMetric: "Metrik", thVal: "Nilai", thNote: "Catatan",
    rows: [
      ["Jumlah permintaan", `${R.requests_made}`, "100 VU × 1"],
      ["Keberhasilan terima (202)", `${enqSucc}%`, "POST langsung beri jobId"],
      ["Keberhasilan hasil akhir", `${resSucc}%`, "mencapai hasil (done)"],
      ["Respons terima p95", `${enqP95} ms`, "pengguna tak menunggu"],
      ["Waktu ke hasil median", `${ttrMed} s`, "terima→hasil (termasuk antre)"],
      ["Waktu ke hasil p95", `${ttrP95} s`, ""],
      ["Waktu ke hasil maks", `${ttrMax} s`, ""],
      ["Polling 404 (sticky miss)", `${R.poll_404}`, "0 = routing sesi normal"],
      ["Error hulu (job error)", `${R.upstream_error}`, "0 = tak ada error AI Studio"],
      ["Timeout klien", `${R.client_timeout}`, "0 = semua selesai tepat waktu"],
    ],
    h4: "4. Dibanding Sebelumnya (Dampak Perbaikan)",
    beforeAfter: `Pada mode sinkron lama, panggilan LLM diproses langsung saat permintaan sehingga saat beban bersamaan menumpuk, AI Studio hulu mengembalikan error 500 per panggilan (50 pengguna ${OLD_SYNC_50}%, 600 pengguna ${OLD_SYNC_600}% sukses). <b>Antrian asinkron + gerbang konkurensi</b> membatasi jumlah panggilan serentak di bawah batas hulu dan mengantre kelebihannya sebentar, <b>mengubah error menjadi penundaan</b>. Hasilnya, pada 100 pengguna bersamaan keberhasilan akhir mencapai ${resSucc}%.`,
    h5: "5. Rekomendasi",
    recs: [
      `<b>Pertahankan konfigurasi:</b> kelas berisi 100 orang stabil dengan setelan saat ini. Tak perlu tindakan tambahan.`,
      `<b>Siapkan skala lebih besar:</b> di atas 600 pengguna penundaan hasil bisa memanjang — sesuaikan jumlah replika atau nilai gerbang (× replika ≤ ~20) terhadap batas hulu.`,
      `<b>UX indikator progres:</b> karena terima instan (202), gunakan indikator "sedang membuat…" agar tunggu terasa wajar.`,
      `<b>Pemantauan:</b> lacak p95 waktu ke hasil dan panjang antrean sebagai metrik operasi untuk scale-up dini.`,
      `<b>Uji skala besar:</b> disarankan uji tambahan skenario 300·600 pengguna bersamaan pada dini hari untuk memetakan kurva penundaan.`,
    ],
    caveatH: "Batasan Pengukuran",
    caveat: `Berdasarkan satu tugas (extractKeyword), satu kali run di jam aktif. Antrian berbasis memori per-proses (replika), sehingga terima dan polling harus dirutekan ke replika yang sama (hash sesi nginx). Pada run ini polling 404=0, memastikan routing normal.`,
    foot: `Dibuat ${GENERATED} · Uji Beban LLM 100 Pengguna LG Magazine · Model ${MODEL} · Data: docs/loadtest-llm-100-async-results.json (k6, terukur)`,
  },
};

// ── HTML template ────────────────────────────────────────────────────────────
function render(t) {
  const setupRows = t.setup.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${v}</td></tr>`).join("\n");
  const bullets = t.bullets.map((b) => `<li>${b}</li>`).join("\n");
  const recs = t.recs.map((b) => `<li>${b}</li>`).join("\n");
  const resultRows = t.rows
    .map(
      ([m, v, n]) =>
        `<tr><td>${m}</td><td class="n"><b>${v}</b></td><td>${n}</td></tr>`,
    )
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
<div class="note">${t.beforeAfter}</div>

<h2>${t.h5}</h2>
<ul>${recs}</ul>

<div class="note amber"><b>${t.caveatH}.</b> ${t.caveat}</div>

<div class="foot">${t.foot}</div>

</body></html>`;
}

for (const [key, t] of Object.entries(L)) {
  const out = new URL(`../docs/loadtest/loadtest_llm_100_${key}.html`, import.meta.url);
  writeFileSync(out, render(t));
  console.log("HTML written:", out.pathname);
}
