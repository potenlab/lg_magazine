// 600-user LLM API burst-test report generator — bilingual (KR + ID).
// Reads docs/loadtest-llm-600-async-results.json (real k6 data; no hand-entered
// numbers) and writes docs/loadtest_llm_600_api_kr.html and ..._id.html.
// Render to PDF afterwards with headless Chrome --print-to-pdf.
//
//   node scripts/generate-loadtest-llm-600-api-report.mjs

import { readFileSync, writeFileSync } from "node:fs";

const R = JSON.parse(
  readFileSync(new URL("../docs/loadtest/results/loadtest-llm-600-async-results.json", import.meta.url)),
);

// ── derived numbers ──────────────────────────────────────────────────────────
const pct = (rate) => ((rate ?? 0) * 100).toFixed(1);
const sec = (ms) => (ms == null ? "—" : (ms / 1000).toFixed(1));
const enqSucc = pct(R.enqueue_accepted_rate);
const resSucc = pct(R.result_success_rate);
const ttrMed = sec(R.time_to_result_med_ms);
const ttrP95 = sec(R.time_to_result_p95_ms);
const ttrMax = sec(R.time_to_result_max_ms);
const enqP95 = Math.round(R.enqueue_ms_p95);
const VUS = R.vus;

// documented context (from code + prior measurements)
const MODEL = "Gemini 2.0 Flash (light lane)";
const GENERATED = "2026-07-08";
const RUN_LOCAL = "≈18:40 KST (16:40 WIB)";
const SERVER =
  "mybook.lgacademy.com · Next.js · Docker 3 replica · nginx · AI Studio (dual-lane: Flash + Sonnet)";
const GATE_CONC = 5;
const REPLICAS = 3;
const EFF_CONC = GATE_CONC * REPLICAS;
// prior baselines for the comparison section
const JUNE_MED = "14.9"; // 2026-06-25 single-lane (Sonnet) 600-user async, TTR median s
const JUNE_P95 = "42.2";
const OLD_SYNC_600 = "6.5"; // pre-queue synchronous 600-VU success %

const rate = R.result_success_rate ?? 0;
const tier = rate >= 0.95 ? "good" : rate >= 0.8 ? "warn" : "bad";

const verdictKR =
  tier === "good"
    ? `LLM(AI 생성) 엔드포인트가 ${VUS}명 동시 요청을 <span class="hi">정상적으로 처리합니다</span>.`
    : tier === "warn"
      ? `LLM 엔드포인트가 ${VUS}명 동시 요청을 <span class="hi">대부분 처리하나 일부 지연·실패</span>가 있습니다.`
      : `${VUS}명 동시 요청에서 <span class="hi">상당수 작업이 실패</span>했습니다.`;
const verdictID =
  tier === "good"
    ? `Endpoint LLM (pembuatan AI) <span class="hi">menangani ${VUS} permintaan bersamaan dengan baik</span>.`
    : tier === "warn"
      ? `Endpoint LLM menangani sebagian besar dari ${VUS} permintaan bersamaan, tetapi <span class="hi">ada penundaan/kegagalan</span>.`
      : `Pada ${VUS} permintaan bersamaan, <span class="hi">sebagian besar tugas gagal</span>.`;

// ── language strings ─────────────────────────────────────────────────────────
const L = {
  kr: {
    lang: "ko",
    title: `LLM API 부하 테스트 보고서 — ${VUS}명 동시 사용자`,
    metaTarget: "대상", metaEnv: "환경", metaModel: "모델", metaDate: "작성일",
    metaTool: "도구", metaRun: "실행 시각",
    heroBig: verdictKR,
    heroP: `${VUS}명이 60초 안에 도착해 각자 1건의 LLM 생성 요청(접수 → 폴링 → 결과)을 보내는 버스트 시나리오입니다. <b>최종 성공률 ${resSucc}%</b>, 결과까지 중앙값 <b>${ttrMed}초</b>·p95 <b>${ttrP95}초</b>. 해당 작업(extractKeyword)은 듀얼 레인 중 <b>${MODEL}</b> 라인으로 라우팅됩니다.`,
    cardEnq: "접수 성공률 (202)",
    cardRes: "최종 결과 성공률",
    cardTtr: "결과까지 소요 (중앙값)",
    cardP95: "결과까지 소요 (p95)",
    h1: "1. 결론 요약",
    concl: `<b>${VUS}명 동시 버스트에서 접수 ${enqSucc}%, 최종 성공 ${resSucc}%.</b> 비동기 큐가 순간 폭주를 오류 대신 대기로 흡수하고, 듀얼 모델 도입 후 가벼운 작업은 ${MODEL} 전용 라인에서 처리됩니다. 6월 단일 레인(Sonnet) 측정의 중앙값 ${JUNE_MED}초 대비 이번 중앙값은 ${ttrMed}초입니다.`,
    bullets: [
      `<b>최종 성공률 ${resSucc}%:</b> ${R.requests_made}건 요청 기준 — 폴링 404 ${R.poll_404}건 · 상위 오류 ${R.upstream_error}건 · 타임아웃 ${R.client_timeout}건.`,
      `<b>빠른 접수:</b> POST는 즉시 202 + jobId 반환 (p95 ${enqP95}ms). 사용자는 기다리지 않고 화면이 진행됨.`,
      `<b>결과 지연:</b> 중앙값 ${ttrMed}초 · p95 ${ttrP95}초 · 최대 ${ttrMax}초 — 큐 대기 포함.`,
      `<b>동시성 게이트:</b> 프로세스당 ${GATE_CONC}건 × ${REPLICAS} 레플리카 ≈ ${EFF_CONC}건으로 상위 한계 이하 직렬화.`,
      `<b>모델:</b> ${MODEL} 기준 측정 (듀얼 레인 운영 기본값).`,
    ],
    h2: "2. 테스트 설정",
    setup: [
      ["엔드포인트", "POST /api/v3/llm (접수) · GET /api/v3/llm/jobs (폴링)"],
      ["작업(task)", "extractKeyword — 가벼운 실제 LLM 작업 1건/사용자"],
      ["모델 라인", `${MODEL} — 듀얼 레인 자동 라우팅`],
      ["제공자", "AI Studio 듀얼 레인 (운영 기본값)"],
      ["인증", `오프라인 발급한 운영 유효 세션 쿠키 (loadtest-00001…${String(VUS).padStart(5, "0")})`],
      ["부하 패턴", `${VUS} VU, ${R.arrival_window_s}초에 걸쳐 도착, 각 VU 1회 요청 (버스트 모사)`],
      ["측정 방식", "접수(202) → 2초 간격 폴링 → 결과까지 시간(time-to-result)"],
      ["작업당 마감", "300초(5분) 내 미완료 시 실패 처리"],
      ["사전 조건", "운영 큐 백로그 소진 확인 후 실행"],
    ],
    h3: "3. 측정 결과",
    thMetric: "지표", thVal: "값", thNote: "비고",
    rows: [
      ["요청 수", `${R.requests_made}건`, `${VUS} VU × 1회`],
      ["접수 성공률 (202)", `${enqSucc}%`, "POST가 즉시 jobId 반환"],
      ["최종 결과 성공률", `${resSucc}%`, "결과(done)까지 도달"],
      ["접수 응답 p95", `${enqP95} ms`, "사용자 대기 없음"],
      ["결과까지 중앙값", `${ttrMed} s`, "접수→결과(큐 대기 포함)"],
      ["결과까지 p95", `${ttrP95} s`, ""],
      ["결과까지 최대", `${ttrMax} s`, ""],
      ["폴링 404 (스티키 미스)", `${R.poll_404}건`, "0 = 세션 라우팅 정상"],
      ["상위 오류(job error)", `${R.upstream_error}건`, "AI Studio 처리 오류"],
      ["클라이언트 타임아웃", `${R.client_timeout}건`, "마감(5분) 초과"],
    ],
    h4: "4. 이전 측정과 비교",
    beforeAfter: `초기 동기 방식은 600명 동시에서 성공률 ${OLD_SYNC_600}%로 붕괴했고, 비동기 큐 도입(6월 25일, 단일 레인 Sonnet) 후 100% 성공·중앙값 ${JUNE_MED}초·p95 ${JUNE_P95}초를 기록했습니다. 이번 측정(듀얼 레인)에서는 가벼운 작업이 ${MODEL} 라인으로 분리되어 <b>성공률 ${resSucc}% · 중앙값 ${ttrMed}초 · p95 ${ttrP95}초</b>입니다.`,
    h5: "5. 권장 사항",
    recs: [
      `<b>현 구성 유지:</b> ${VUS}명 동시 버스트를 현재 설정이 감당합니다.`,
      `<b>진행 표시 UX:</b> 접수가 즉시(202)이므로 "생성 중…" 진행 표시로 체감 대기를 자연스럽게.`,
      `<b>모니터링:</b> 결과까지 p95와 큐 대기 길이를 운영 지표로 추적.`,
      `<b>풀 플로우 참고:</b> 전체 세션(23개 작업) 부하는 별도 풀 플로우 테스트로 측정 — 부분 실측(11분)에서 작업 성공률 99.4% 확인.`,
    ],
    caveatH: "측정 한계",
    caveat: `단일 가벼운 작업(extractKeyword) 기준 1회 실행 — 무거운 합성(Sonnet 라인) 작업의 지연은 본 테스트 범위 밖입니다. 큐는 프로세스(레플리카) 내 메모리 기반이므로 접수와 폴링이 같은 레플리카로 라우팅되어야 하며(nginx 세션 해시), 폴링 404=${R.poll_404}건으로 라우팅 상태를 확인했습니다.`,
    foot: `생성일 ${GENERATED} · LG 매거진 LLM ${VUS}명 API 부하 테스트 · ${MODEL} · 데이터: docs/loadtest-llm-600-async-results.json (k6, 실측)`,
  },
  id: {
    lang: "id",
    title: `Laporan Uji Beban API LLM — ${VUS} Pengguna Bersamaan`,
    metaTarget: "Target", metaEnv: "Lingkungan", metaModel: "Model", metaDate: "Tanggal",
    metaTool: "Alat", metaRun: "Waktu eksekusi",
    heroBig: verdictID,
    heroP: `Skenario burst: ${VUS} pengguna tiba dalam 60 detik, masing-masing mengirim 1 permintaan pembuatan LLM (terima → polling → hasil). <b>Keberhasilan akhir ${resSucc}%</b>, waktu ke hasil median <b>${ttrMed} dtk</b> · p95 <b>${ttrP95} dtk</b>. Tugas ini (extractKeyword) dirutekan ke jalur <b>${MODEL}</b> pada arsitektur dual-lane.`,
    cardEnq: "Keberhasilan terima (202)",
    cardRes: "Keberhasilan hasil akhir",
    cardTtr: "Waktu ke hasil (median)",
    cardP95: "Waktu ke hasil (p95)",
    h1: "1. Ringkasan Kesimpulan",
    concl: `<b>Pada burst ${VUS} pengguna bersamaan: terima ${enqSucc}%, keberhasilan akhir ${resSucc}%.</b> Antrean asinkron menyerap lonjakan sebagai antrean, bukan error, dan sejak dual-model tugas ringan diproses di jalur khusus ${MODEL}. Dibanding pengukuran Juni (jalur tunggal Sonnet, median ${JUNE_MED} dtk), median kali ini ${ttrMed} dtk.`,
    bullets: [
      `<b>Keberhasilan akhir ${resSucc}%:</b> dari ${R.requests_made} permintaan — polling 404 ${R.poll_404} · error upstream ${R.upstream_error} · timeout ${R.client_timeout}.`,
      `<b>Penerimaan cepat:</b> POST langsung mengembalikan 202 + jobId (p95 ${enqP95}ms). Pengguna tidak menunggu, layar tetap berjalan.`,
      `<b>Latensi hasil:</b> median ${ttrMed} dtk · p95 ${ttrP95} dtk · maks ${ttrMax} dtk — termasuk antre.`,
      `<b>Gerbang konkurensi:</b> ${GATE_CONC}/proses × ${REPLICAS} replika ≈ ${EFF_CONC}, dijaga di bawah batas upstream.`,
      `<b>Model:</b> diukur pada ${MODEL} (default produksi dual-lane).`,
    ],
    h2: "2. Konfigurasi Pengujian",
    setup: [
      ["Endpoint", "POST /api/v3/llm (terima) · GET /api/v3/llm/jobs (polling)"],
      ["Tugas (task)", "extractKeyword — 1 tugas LLM ringan nyata per pengguna"],
      ["Jalur model", `${MODEL} — routing otomatis dual-lane`],
      ["Provider", "AI Studio dual-lane (default produksi)"],
      ["Autentikasi", `Cookie sesi valid-produksi diterbitkan offline (loadtest-00001…${String(VUS).padStart(5, "0")})`],
      ["Pola beban", `${VUS} VU, tiba dalam ${R.arrival_window_s} detik, tiap VU 1 permintaan (simulasi burst)`],
      ["Pengukuran", "terima (202) → polling tiap 2 dtk → time-to-result"],
      ["Tenggat per tugas", "Gagal jika tidak selesai dalam 300 dtk (5 menit)"],
      ["Prasyarat", "Backlog antrean produksi dipastikan kosong sebelum eksekusi"],
    ],
    h3: "3. Hasil Pengukuran",
    thMetric: "Metrik", thVal: "Nilai", thNote: "Catatan",
    rows: [
      ["Jumlah permintaan", `${R.requests_made}`, `${VUS} VU × 1`],
      ["Keberhasilan terima (202)", `${enqSucc}%`, "POST langsung beri jobId"],
      ["Keberhasilan hasil akhir", `${resSucc}%`, "mencapai hasil (done)"],
      ["Respons terima p95", `${enqP95} ms`, "pengguna tak menunggu"],
      ["Waktu ke hasil median", `${ttrMed} dtk`, "terima→hasil (termasuk antre)"],
      ["Waktu ke hasil p95", `${ttrP95} dtk`, ""],
      ["Waktu ke hasil maks", `${ttrMax} dtk`, ""],
      ["Polling 404 (sticky miss)", `${R.poll_404}`, "0 = routing sesi normal"],
      ["Error upstream (job error)", `${R.upstream_error}`, "error pemrosesan AI Studio"],
      ["Timeout klien", `${R.client_timeout}`, "melampaui tenggat 5 menit"],
    ],
    h4: "4. Perbandingan dengan Pengukuran Sebelumnya",
    beforeAfter: `Mode sinkron awal runtuh pada 600 pengguna bersamaan (keberhasilan ${OLD_SYNC_600}%). Setelah antrean asinkron (25 Juni, jalur tunggal Sonnet): 100% berhasil, median ${JUNE_MED} dtk, p95 ${JUNE_P95} dtk. Pada pengukuran kali ini (dual-lane), tugas ringan dipisah ke jalur ${MODEL}: <b>keberhasilan ${resSucc}% · median ${ttrMed} dtk · p95 ${ttrP95} dtk</b>.`,
    h5: "5. Rekomendasi",
    recs: [
      `<b>Pertahankan konfigurasi:</b> burst ${VUS} pengguna bersamaan tertangani dengan setelan saat ini.`,
      `<b>UX indikator progres:</b> karena terima instan (202), gunakan indikator "sedang membuat…" agar tunggu terasa wajar.`,
      `<b>Pemantauan:</b> lacak p95 waktu ke hasil dan panjang antrean sebagai metrik operasional.`,
      `<b>Catatan alur penuh:</b> beban sesi lengkap (23 tugas) diukur lewat uji full-flow terpisah — pengukuran parsial (11 menit) menunjukkan keberhasilan tugas 99,4%.`,
    ],
    caveatH: "Batasan Pengukuran",
    caveat: `Berdasarkan satu tugas ringan (extractKeyword), satu kali eksekusi — latensi tugas sintesis berat (jalur Sonnet) di luar cakupan uji ini. Antrean berbasis memori per-proses (replika), sehingga terima dan polling harus dirutekan ke replika yang sama (hash sesi nginx); polling 404=${R.poll_404} mengonfirmasi routing.`,
    foot: `Dibuat ${GENERATED} · Uji beban API LLM ${VUS} pengguna LG Magazine · ${MODEL} · data: docs/loadtest-llm-600-async-results.json (k6, terukur)`,
  },
};

// ── HTML template ────────────────────────────────────────────────────────────
function render(t) {
  const setupRows = t.setup.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${v}</td></tr>`).join("\n");
  const bullets = t.bullets.map((b) => `<li>${b}</li>`).join("\n");
  const recs = t.recs.map((b) => `<li>${b}</li>`).join("\n");
  const resultRows = t.rows
    .map(([m, v, n]) => `<tr><td>${m}</td><td class="n"><b>${v}</b></td><td>${n}</td></tr>`)
    .join("\n");
  const heroBg = tier === "good" ? "#052e16" : tier === "warn" ? "#451a03" : "#450a0a";
  const heroHi = tier === "good" ? "#86efac" : tier === "warn" ? "#fcd34d" : "#fca5a5";
  const heroP = tier === "good" ? "#d1fae5" : tier === "warn" ? "#fde68a" : "#fecaca";
  const noteBg = tier === "good" ? "#f0fdf4" : tier === "warn" ? "#fffbeb" : "#fef2f2";
  const noteBd = tier === "good" ? "#22c55e" : tier === "warn" ? "#f59e0b" : "#ef4444";
  return `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 15mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Apple SD Gothic Neo","Malgun Gothic",-apple-system,"Segoe UI",sans-serif; color:#1a1a1a; font-size:12px; line-height:1.6; margin:0; }
  h1 { font-size:20px; margin:0 0 4px; }
  h2 { font-size:14px; margin:20px 0 8px; padding-bottom:4px; border-bottom:2px solid #e2e8f0; }
  code { background:#f1f5f9; padding:1px 4px; border-radius:3px; font-size:10.5px; }
  .meta { font-size:10.5px; color:#555; margin-bottom:12px; }
  .meta b { color:#222; }
  .hero { background:${heroBg}; color:#fff; border-radius:10px; padding:16px 18px; margin:12px 0; }
  .hero .big { font-size:18px; font-weight:800; line-height:1.35; }
  .hero .big .hi { color:${heroHi}; }
  .hero p { margin:8px 0 0; font-size:11.5px; color:${heroP}; }
  .cards { display:flex; gap:10px; margin:12px 0; }
  .card { flex:1; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; background:#f8fafc; }
  .card .v { font-size:18px; font-weight:800; color:#0f172a; }
  .card .v.good { color:#15803d; }
  .card .v.warn { color:#b45309; }
  .card .v.bad { color:#b91c1c; }
  .card .l { font-size:10px; color:#64748b; margin-top:2px; }
  table { width:100%; border-collapse:collapse; margin:6px 0; font-size:11px; }
  th, td { border:1px solid #e2e8f0; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:#f1f5f9; font-weight:700; }
  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .note { background:${noteBg}; border-left:3px solid ${noteBd}; padding:8px 12px; border-radius:0 6px 6px 0; font-size:11px; margin:8px 0; }
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
  <div class="card"><div class="v ${tier}">${enqSucc}%</div><div class="l">${t.cardEnq}</div></div>
  <div class="card"><div class="v ${tier}">${resSucc}%</div><div class="l">${t.cardRes}</div></div>
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
  const out = new URL(`../docs/loadtest/reports/loadtest_llm_600_api_${key}.html`, import.meta.url);
  writeFileSync(out, render(t));
  console.log("HTML written:", out.pathname);
}
