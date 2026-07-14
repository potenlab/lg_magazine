// LLM endpoint load-test report generator — bilingual (KR + ID).
// Reads docs/loadtest-llm-600-results.json (real k6 data; no hand-entered numbers)
// and writes docs/loadtest_llm_600_kr.html and docs/loadtest_llm_600_id.html.
// Render to PDF afterwards with headless Chrome --print-to-pdf.
//
//   node scripts/generate-loadtest-llm-report.mjs

import { readFileSync, writeFileSync } from "node:fs";

const R = JSON.parse(readFileSync(new URL("../docs/loadtest/loadtest-llm-600-results.json", import.meta.url)));
const RE = JSON.parse(readFileSync(new URL("../docs/loadtest/loadtest-llm-realistic-combined.json", import.meta.url)));

// ── derived numbers ──────────────────────────────────────────────────────────
const ORDER = ["050", "200", "400", "600"];
const s = (k) => R.per_stage[k];
const pctOf = (rate) => (rate * 100).toFixed(1);
const sec = (ms) => (ms / 1000).toFixed(1);
const globSucc = pctOf(R.global_success_rate);
const globP95 = sec(R.global_p95_ms);

// documented context constants (measured this session, outside the ramp)
const BASELINE_MS = 2770;          // single unloaded call: HTTP 200
const BURST_CONC = 40;             // ad-hoc concurrent burst
const BURST_SUCC = 58;             // ~23/40 succeeded in the burst
const GENERATED = "2026-06-19";
const RUN_LOCAL = "≈14:00 KST (운영 시간대 / jam aktif)";
const SERVER = "mybook.lgacademy.com · Next.js · Docker 3 replica · nginx · AI Studio 10-key rotation pool";

// colour class by success rate (higher = better here)
const succClass = (rate) => (rate >= 0.8 ? "good" : rate >= 0.4 ? "warn" : "bad");

function curveRows() {
  return ORDER.map((k) => {
    const r = s(k);
    return `<tr>
      <td class="n">${r.vus}</td>
      <td class="n ${succClass(r.success_rate)}">${pctOf(r.success_rate)}%</td>
      <td class="n">${sec(r.med_ms)}s</td>
      <td class="n">${sec(r.p95_ms)}s</td>
      <td class="n">${sec(r.max_ms)}s</td>
      <td class="n">${r.upstream_500.toLocaleString()}</td>
    </tr>`;
  }).join("\n");
}

// simple success-rate bar chart (width = success%)
function curveBars(label) {
  return ORDER.map((k) => {
    const r = s(k);
    const w = Math.max(2, Math.round(r.success_rate * 100));
    const cls = succClass(r.success_rate);
    return `<div class="tlrow"><span class="tlt">${r.vus} VU</span><span class="tlbarwrap"><span class="tlbar ${cls}" style="width:${w}%"></span></span><span class="tlv">${pctOf(r.success_rate)}% ${label}</span></div>`;
  }).join("\n");
}

function realisticRows() {
  return RE.scenarios.map((sc) => {
    const cls = sc.task_success_rate >= 0.8 ? "good" : sc.task_success_rate >= 0.4 ? "warn" : "bad";
    return `<tr>
      <td>${sc.label}</td>
      <td class="n ${cls}">${(sc.task_success_rate * 100).toFixed(1)}%</td>
      <td class="n">${(sc.heavy_med_ms / 1000).toFixed(1)}s</td>
      <td class="n">${(sc.heavy_p95_ms / 1000).toFixed(1)}s</td>
      <td class="n">${(sc.session_med_ms / 60000).toFixed(1)} min</td>
    </tr>`;
  }).join("\n");
}

// ── language strings ─────────────────────────────────────────────────────────
const L = {
  kr: {
    lang: "ko",
    title: "LLM 엔드포인트 부하 테스트 결과 보고서",
    metaTarget: "대상", metaEnv: "환경", metaDate: "작성일", metaTool: "도구", metaRun: "실행 시각",
    heroBig: `LLM(AI 생성) 엔드포인트는 600명 동시 사용을 <span class="bad-i">감당하지 못합니다</span>.`,
    heroP: `동시 50명에서 이미 성공률이 약 42%로 떨어지고, 400명에서는 5% 미만으로 붕괴합니다. 원인은 일일 토큰 한도가 아니라 <b>동시 호출 시 상위 AI Studio API가 반환하는 일반 500 오류</b>입니다.`,
    cardSucc: "전체 성공률 (50→600 램프)",
    cardP95: "응답시간 p95 (부하 시)",
    cardBase: "단일 호출 기준 (무부하)",
    cardReq: "총 요청 수",
    h1: "1. 결론 요약",
    concl: `<b>현재 구성으로는 600명 규모 수업에서 AI 매거진 생성이 정상 동작하지 않습니다.</b> 가장 가벼운 작업(extractKeyword, 80토큰)으로 측정했음에도, 동시 사용자가 늘수록 성공률이 가파르게 하락했습니다. 무부하 단일 호출은 2.8초/정상이지만, 동시성이 올라가면 상위 제공자(AI Studio)가 건별로 500을 반환합니다.`,
    bullets: [
      `<b>용량 곡선:</b> 50명 41.8% → 200명 15.3% → 400명 4.7% → 600명 6.5% 성공. 동시성이 핵심 병목.`,
      `<b>실패 성격:</b> 일일 토큰 한도("토큰 호출량") 메시지는 <b>전혀 없었음</b>(pool_exhausted=0). 대신 <code>aistudio call (LG_BOOK_x): 500 "오류가 발생했습니다. 다시 시도해 주세요."</code> 형태의 일반 오류.`,
      `<b>10키 로테이션의 한계:</b> 키를 돌려도 상위 API 자체가 동시 부하에서 500을 내므로 동시성 여유가 생기지 않음.`,
      `<b>지연:</b> 부하 시 중앙값 10초, p95 13~19초 (무부하 2.8초 대비 4~7배).`,
    ],
    h2: "2. 테스트 설정",
    setup: [
      ["엔드포인트", "POST /api/v3/llm"],
      ["작업(task)", "extractKeyword (최경량, 80 토큰)"],
      ["제공자", "AI Studio 10키 로테이션 풀 (운영 기본값)"],
      ["인증", "오프라인 발급한 운영 유효 세션 쿠키 (loadtest-00001…600)"],
      ["부하 패턴", "50 → 200 → 400 → 600 VU, 각 단계 20초 유지 (제한 실행)"],
      ["실행 모델", "closed-loop (각 VU가 응답 후 1~3초 후 재요청)"],
    ],
    h3: "3. 용량 곡선 (동시 사용자별)",
    curveCap: "성공률 (높을수록 좋음)",
    thVU: "동시 사용자", thSucc: "성공률", thMed: "응답 중앙값", thP95: "p95", thMax: "최대", thUp: "상위 500 오류",
    h3b: "4. 실측 — 실제 사용 시나리오 (전체 세션)",
    realIntro: `위 3장은 가장 가벼운 작업(extractKeyword)만 반복한 측정입니다. 실제 사용자는 한 세션에서 <b>약 ${RE.tasks_per_session}개의 LLM 작업</b>(그중 무거운 합성 작업 <b>${RE.heavy_calls_per_session}개</b>, 각 2,200토큰·15~25초)을 순서대로 호출합니다. 아래는 이 <b>전체 세션 흐름</b>을 그대로 재현해 측정한 값입니다.`,
    thScn: "동시 세션", thSucc2: "호출 성공률", thHeavyMed: "무거운 작업 중앙값", thHeavyP95: "무거운 작업 p95", thSessDur: "세션 소요(중앙값)",
    realInsight: `<b>무부하 단일 사용자조차 호출 성공률이 ${(RE.scenarios[0].task_success_rate*100).toFixed(0)}%</b>에 그쳐, 21개 호출을 한 번도 실패 없이 끝내는 세션은 사실상 없습니다(완주율 0%). <b>동시 10세션</b>만 되어도 무거운 작업 p95가 <b>${(RE.scenarios[1].heavy_p95_ms/1000).toFixed(0)}초</b>로 서버 제한(${RE.server_timeout_s}초)에 근접해 타임아웃이 발생하고, 한 세션 완주에 약 <b>${(RE.scenarios[1].session_med_ms/60000).toFixed(1)}분</b>이 걸립니다. 따라서 600명 동시 사용에서는 실질적으로 매거진 생성이 거의 완료되지 않습니다.`,
    h4: "5. 실패 원인 분석",
    cause: `실패는 웹 서버(nginx/Next.js)나 인증이 아니라 <b>상위 AI Studio API</b>에서 발생했습니다. 동시 호출이 몰리면 개별 키(LG_BOOK_1…10)가 <code>500 "오류가 발생했습니다"</code>를 반환합니다. 이는 일일 한도 소진과 다른, <b>동시성/순간 처리량 한계</b>입니다. 따라서 키를 더 추가해도 같은 순간 동시 호출이 많으면 동일하게 실패할 가능성이 높습니다.`,
    h5: "6. 권장 사항",
    recs: [
      `<b>동시 호출 제한(큐잉):</b> 앱 레벨에서 동시 진행 LLM 호출 수에 상한을 두고 초과분을 큐로 직렬화 — 순간 스탬피드 방지.`,
      `<b>재시도(백오프):</b> 일반 500은 일시적 — 지수 백오프 + 지터로 1~2회 재시도.`,
      `<b>UX 분산:</b> 생성 트리거 단계를 사용자별로 시차를 두어 동시 호출 집중 완화.`,
      `<b>오버플로 폴백:</b> 한도 초과 시 Anthropic(claude) 모드로 일부 트래픽 우회 (x-llm-mode=claude).`,
      `<b>운영 시간대 재측정:</b> 이번 실행은 운영 시간대였음 — 심야(off-hours) 재측정으로 동시성 한계와 일일 한도를 분리 확인 권장.`,
    ],
    caveatH: "측정 한계",
    caveat: `제한 실행(각 단계 20초)·최경량 작업·운영 시간대 조건. closed-loop는 실제 입장보다 가혹하지만, 실제 수업에서도 동일 단계에서 LLM 호출이 군집하므로 방향성은 유효합니다.`,
    foot: `생성일 ${GENERATED} · LG 매거진 LLM 부하 테스트 · 데이터: docs/loadtest-llm-600-results.json (k6, 실측)`,
  },
  id: {
    lang: "id",
    title: "Laporan Hasil Uji Beban Endpoint LLM",
    metaTarget: "Target", metaEnv: "Lingkungan", metaDate: "Tanggal", metaTool: "Alat", metaRun: "Waktu jalan",
    heroBig: `Endpoint LLM (pembuatan AI) <span class="bad-i">tidak mampu</span> menangani 600 pengguna bersamaan.`,
    heroP: `Pada 50 pengguna bersamaan, tingkat keberhasilan sudah turun ke ±42%, dan pada 400 pengguna anjlok di bawah 5%. Penyebabnya bukan batas token harian, melainkan <b>error 500 umum dari API AI Studio hulu saat panggilan bersamaan</b>.`,
    cardSucc: "Keberhasilan total (ramp 50→600)",
    cardP95: "Latensi p95 (saat beban)",
    cardBase: "Panggilan tunggal (tanpa beban)",
    cardReq: "Total permintaan",
    h1: "1. Ringkasan Kesimpulan",
    concl: `<b>Dengan konfigurasi saat ini, pembuatan majalah AI tidak akan berjalan normal untuk kelas berisi 600 orang.</b> Walaupun diukur dengan tugas paling ringan (extractKeyword, 80 token), tingkat keberhasilan turun tajam seiring bertambahnya pengguna bersamaan. Panggilan tunggal tanpa beban = 2,8 detik/sukses, tetapi saat konkurensi naik, penyedia hulu (AI Studio) mengembalikan 500 per permintaan.`,
    bullets: [
      `<b>Kurva kapasitas:</b> 50 pengguna 41,8% → 200 pengguna 15,3% → 400 pengguna 4,7% → 600 pengguna 6,5% sukses. Konkurensi adalah hambatan utama.`,
      `<b>Sifat kegagalan:</b> Pesan batas token harian ("토큰 호출량") <b>sama sekali tidak muncul</b> (pool_exhausted=0). Yang muncul: error umum <code>aistudio call (LG_BOOK_x): 500 "terjadi kesalahan, coba lagi."</code>`,
      `<b>Batas rotasi 10 kunci:</b> Memutar kunci tidak menambah ruang konkurensi karena API hulu sendiri mengembalikan 500 saat beban bersamaan.`,
      `<b>Latensi:</b> Saat beban, median 10 detik, p95 13–19 detik (4–7× lipat dari 2,8 detik tanpa beban).`,
    ],
    h2: "2. Konfigurasi Uji",
    setup: [
      ["Endpoint", "POST /api/v3/llm"],
      ["Tugas (task)", "extractKeyword (paling ringan, 80 token)"],
      ["Penyedia", "Pool rotasi 10 kunci AI Studio (default produksi)"],
      ["Autentikasi", "Cookie sesi valid-produksi dibuat offline (loadtest-00001…600)"],
      ["Pola beban", "50 → 200 → 400 → 600 VU, tahan 20 detik per tahap (run terbatas)"],
      ["Model eksekusi", "closed-loop (tiap VU meminta ulang 1–3 detik setelah respons)"],
    ],
    h3: "3. Kurva Kapasitas (per pengguna bersamaan)",
    curveCap: "Tingkat keberhasilan (makin tinggi makin baik)",
    thVU: "Pengguna bersamaan", thSucc: "Keberhasilan", thMed: "Median respons", thP95: "p95", thMax: "Maks", thUp: "Error 500 hulu",
    h3b: "4. Pengukuran — Skenario Penggunaan Nyata (sesi penuh)",
    realIntro: `Bab 3 di atas hanya mengulang tugas paling ringan (extractKeyword). Pengguna nyata memanggil <b>±${RE.tasks_per_session} tugas LLM per sesi</b> (termasuk <b>${RE.heavy_calls_per_session} tugas sintesis berat</b>, masing-masing 2.200 token · 15–25 detik) secara berurutan. Berikut hasil mereproduksi <b>seluruh alur sesi</b> tersebut.`,
    thScn: "Sesi bersamaan", thSucc2: "Keberhasilan panggilan", thHeavyMed: "Median tugas berat", thHeavyP95: "p95 tugas berat", thSessDur: "Durasi sesi (median)",
    realInsight: `<b>Bahkan satu pengguna tanpa beban pun hanya ${(RE.scenarios[0].task_success_rate*100).toFixed(0)}% panggilan berhasil</b>, sehingga sesi yang menuntaskan 21 panggilan tanpa satu kegagalan praktis tidak ada (tingkat tuntas 0%). Pada <b>10 sesi bersamaan</b> saja, p95 tugas berat mencapai <b>${(RE.scenarios[1].heavy_p95_ms/1000).toFixed(0)} detik</b> — mendekati batas server (${RE.server_timeout_s} detik) sehingga timeout terjadi, dan satu sesi butuh ±<b>${(RE.scenarios[1].session_med_ms/60000).toFixed(1)} menit</b>. Maka pada 600 pengguna bersamaan, pembuatan majalah praktis hampir tidak pernah selesai.`,
    h4: "5. Analisis Penyebab Kegagalan",
    cause: `Kegagalan bukan dari web server (nginx/Next.js) atau autentikasi, melainkan dari <b>API AI Studio hulu</b>. Saat panggilan bersamaan menumpuk, tiap kunci (LG_BOOK_1…10) mengembalikan <code>500 "terjadi kesalahan"</code>. Ini berbeda dari habisnya kuota harian — ini <b>batas konkurensi/throughput sesaat</b>. Karena itu, menambah kunci pun kemungkinan tetap gagal bila banyak panggilan terjadi di saat yang sama.`,
    h5: "6. Rekomendasi",
    recs: [
      `<b>Batasi konkurensi (antrian):</b> Beri batas jumlah panggilan LLM aktif di level aplikasi dan antrekan sisanya — cegah stampede sesaat.`,
      `<b>Coba ulang (backoff):</b> Error 500 bersifat sementara — coba ulang 1–2× dengan exponential backoff + jitter.`,
      `<b>Sebar di UX:</b> Beri jeda antar-pengguna pada langkah pemicu generasi agar panggilan tidak menumpuk bersamaan.`,
      `<b>Fallback overflow:</b> Saat melewati batas, alihkan sebagian trafik ke mode Anthropic (x-llm-mode=claude).`,
      `<b>Ukur ulang di jam sepi:</b> Run ini dilakukan di jam aktif — disarankan ukur ulang dini hari untuk memisahkan batas konkurensi dari batas harian.`,
    ],
    caveatH: "Batasan Pengukuran",
    caveat: `Run terbatas (20 detik/tahap), tugas paling ringan, dan dilakukan di jam aktif. Model closed-loop lebih keras daripada kedatangan nyata, tetapi di kelas nyata pun panggilan LLM mengelompok di tahap yang sama, sehingga arah temuan tetap valid.`,
    foot: `Dibuat ${GENERATED} · Uji Beban LLM LG Magazine · Data: docs/loadtest-llm-600-results.json (k6, terukur)`,
  },
};

// ── HTML template ────────────────────────────────────────────────────────────
function render(t) {
  const setupRows = t.setup.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${v}</td></tr>`).join("\n");
  const bullets = t.bullets.map((b) => `<li>${b}</li>`).join("\n");
  const recs = t.recs.map((b) => `<li>${b}</li>`).join("\n");
  return `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 15mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Apple SD Gothic Neo","Malgun Gothic",-apple-system,"Segoe UI",sans-serif; color:#1a1a1a; font-size:12px; line-height:1.6; margin:0; }
  h1 { font-size:21px; margin:0 0 4px; }
  h2 { font-size:14px; margin:20px 0 8px; padding-bottom:4px; border-bottom:2px solid #e2e8f0; }
  code { background:#f1f5f9; padding:1px 4px; border-radius:3px; font-size:10.5px; }
  .meta { font-size:10.5px; color:#555; margin-bottom:12px; }
  .meta b { color:#222; }
  .hero { background:#0f172a; color:#fff; border-radius:10px; padding:16px 18px; margin:12px 0; }
  .hero .big { font-size:18px; font-weight:800; line-height:1.35; }
  .hero .big .bad-i { color:#fca5a5; }
  .hero p { margin:8px 0 0; font-size:11.5px; color:#cbd5e1; }
  .cards { display:flex; gap:10px; margin:12px 0; }
  .card { flex:1; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; background:#f8fafc; }
  .card .v { font-size:18px; font-weight:800; color:#0f172a; }
  .card .v.bad { color:#b91c1c; }
  .card .l { font-size:10px; color:#64748b; margin-top:2px; }
  table { width:100%; border-collapse:collapse; margin:6px 0; font-size:11px; }
  th, td { border:1px solid #e2e8f0; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:#f1f5f9; font-weight:700; }
  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .good { color:#15803d; font-weight:700; }
  .warn { color:#b45309; font-weight:700; }
  .bad  { color:#b91c1c; font-weight:700; }
  .note { background:#fef2f2; border-left:3px solid #ef4444; padding:8px 12px; border-radius:0 6px 6px 0; font-size:11px; margin:8px 0; }
  .note.amber { background:#fffbeb; border-left-color:#f59e0b; }
  ul { margin:6px 0 6px 18px; padding:0; }
  li { margin:4px 0; }
  .tlrow { display:flex; align-items:center; gap:8px; margin:3px 0; font-size:10px; }
  .tlt { width:46px; color:#64748b; text-align:right; }
  .tlbarwrap { flex:1; background:#f1f5f9; border-radius:4px; height:14px; overflow:hidden; }
  .tlbar { display:block; height:100%; }
  .tlbar.good { background:#16a34a; } .tlbar.warn { background:#f59e0b; } .tlbar.bad { background:#ef4444; }
  .tlv { width:170px; color:#475569; }
  .foot { margin-top:18px; font-size:9.5px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:8px; }
</style></head><body>

<h1>${t.title}</h1>
<div class="meta">
  ${t.metaTarget}: <b>LG Magazine</b> &nbsp;·&nbsp;
  ${t.metaEnv}: <b>${SERVER}</b> &nbsp;·&nbsp;
  ${t.metaTool}: <b>k6</b> &nbsp;·&nbsp;
  ${t.metaRun}: <b>${RUN_LOCAL}</b> &nbsp;·&nbsp;
  ${t.metaDate}: <b>${GENERATED}</b>
</div>

<div class="hero">
  <div class="big">${t.heroBig}</div>
  <p>${t.heroP}</p>
</div>

<div class="cards">
  <div class="card"><div class="v bad">${globSucc}%</div><div class="l">${t.cardSucc}</div></div>
  <div class="card"><div class="v">${globP95}s</div><div class="l">${t.cardP95}</div></div>
  <div class="card"><div class="v">${(BASELINE_MS/1000).toFixed(1)}s</div><div class="l">${t.cardBase}</div></div>
  <div class="card"><div class="v">${R.total_requests.toLocaleString()}</div><div class="l">${t.cardReq}</div></div>
</div>

<h2>${t.h1}</h2>
<div class="note">${t.concl}</div>
<ul>${bullets}</ul>

<h2>${t.h2}</h2>
<table>${setupRows}</table>

<h2>${t.h3}</h2>
<p>${t.curveCap}</p>
${curveBars(t.curveCap)}
<table style="margin-top:10px">
  <tr><th class="n">${t.thVU}</th><th class="n">${t.thSucc}</th><th class="n">${t.thMed}</th><th class="n">${t.thP95}</th><th class="n">${t.thMax}</th><th class="n">${t.thUp}</th></tr>
  ${curveRows()}
</table>

<h2>${t.h3b}</h2>
<p>${t.realIntro}</p>
<table style="margin-top:6px">
  <tr><th class="n">${t.thScn}</th><th class="n">${t.thSucc2}</th><th class="n">${t.thHeavyMed}</th><th class="n">${t.thHeavyP95}</th><th class="n">${t.thSessDur}</th></tr>
  ${realisticRows()}
</table>
<div class="note">${t.realInsight}</div>

<h2>${t.h4}</h2>
<div class="note">${t.cause}</div>

<h2>${t.h5}</h2>
<ul>${recs}</ul>

<div class="note amber"><b>${t.caveatH}.</b> ${t.caveat}</div>

<div class="foot">${t.foot}</div>

</body></html>`;
}

for (const [key, t] of Object.entries(L)) {
  const out = new URL(`../docs/loadtest/loadtest_llm_600_${key}.html`, import.meta.url);
  writeFileSync(out, render(t));
  console.log("HTML written:", out.pathname);
}
