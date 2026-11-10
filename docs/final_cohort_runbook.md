# Final cohort runbook (~320 people, Nov 2026)

What to do on the LG server before the last cohort, in order. Written 2026-11-04.

Background:

- **"The owl only says prepared answers" (August feedback).** When an AI call fails, the app used to show canned
  fallback text that ignores what the participant wrote. Branch `fix/final-cohort-readiness` changes that (see §1).
- **1–3 s wait when opening the site.** Once connected the server answers in under 35 ms. The wait happens before
  the connection is made (the first connection attempt is dropped and the browser retries after 1, 2 or 3 s), which
  points at LG's security device in front of port 443. Not proven yet; §3 and §4 check it.

> **HIWARE rules on the VM.** Type commands exactly as below. No `#` comments, and never type the word for the
> remote-login tool (the three-letter one) anywhere, not even inside a `grep`. Three flagged commands after a
> warning block the session.

---

## 1. What the code fix does

| Change | Effect |
|---|---|
| Automatic retries | A failed AI job is resubmitted up to 3 times (was: only "busy" errors). Long writing tasks get one more full try after ~10–15 s. No new retry starts after 90 s (quick replies) / 180 s (long writing), and none when every API code hit its daily cap, so nobody waits for minutes on a failure that will repeat. A dropped poll keeps waiting for the same job instead of queuing a duplicate. |
| Retry notice instead of fake text | A failure shows "다시 시도" instead of the generic text. After one manual retry the participant may also continue with the basic text, so nobody gets stuck. Live screens: 1-5 (Ch1 mirror), 2-5b (value reflection), 2-10 (Ch2 magazine), 3-10 (growth vision). Three more screens have it but are switched off in the current flow. |
| Fallback text never saved | The closing page and admin PDF no longer save fallback editor notes, cover lines or articles into the participant's record. Before, one failure put the template into their PDF for good. |
| Invented details removed | The fallback editor note no longer claims "퇴근 전 10분…" / "개인 노트 한 페이지" for everyone. The pattern fallback no longer prints the name twice. |
| Quick replies go first | The server queue serves short owl replies before long article writing. Long writing keeps at least one slot per replica, and a long-writing job that has waited 60 s longer than the oldest quick reply goes first, so neither side can starve. |
| Failures are counted | Every fallback a participant sees is reported to the server (`"evt":"llm_fallback"`), and every failed or slow job is logged (`llm_job_error`, `llm_job_slow`). |

## 2. Deploy

Merging into `production`: `src/app/api/v3/llm/route.ts` conflicts at the `enqueue(` call (production wraps the
job with usage logging). Keep production's wrapper **and** pass `{ tier, label: body.task }` as the second
argument to `enqueue`. If that argument is lost, every job lands in the heavy lane and "quick replies go first"
silently stops working. Everything else merges cleanly.

On your Mac, after the fix is merged into `production`:

```bash
cd ~/potenlab/lg_magazine && git fetch origin
git worktree add ../lg_magazine-prod origin/production
cd ../lg_magazine-prod && ./pack-images.sh
```

Next time, skip `worktree add` and run `git checkout --detach origin/production` inside `../lg_magazine-prod`.

If the build stops with `exec /bin/sh: exec format error`, Docker on the Mac can't run Intel (amd64) programs yet.
Colima needs this once per restart: `docker run --privileged --rm tonistiigi/binfmt --install amd64`.

The server already has the database image, so for a code-only update upload just the app image. It is much
smaller to push through the U-Cloud VM. `redeploy.sh` loads the newest `lg_magazine-images*.tar.gz` by the date
in its name:

```bash
docker save lg-magazine:latest | gzip > lg_magazine-images-$(date +%Y%m%d-%H%M%S)-app.tar.gz
```

Upload `lg_magazine-images-<timestamp>.tar.gz` (or the `-app` one) to the server's home folder (`~`), then on the server:

```
cd ~/lg_magazine
sudo ./redeploy.sh
sudo docker compose ps
```

Pass: three `lg-magazine` containers are `Up (healthy)` and the site loads.

## 3. Find out what happened (read-only)

### 3a. How often AI calls failed in August

`llm_usage` gets one row per AI request. A row only counts a call after the AI actually answered, so
`calls = 0` means that request got no answer (fallback shown). This is a lower bound, and it can miss the most
likely August cause: the row is written by the job itself, so a job that expired in the queue (overload) or a
request rejected as busy before it was queued writes **no row at all**. An answer that arrived but could not be
parsed also fell back with `calls ≥ 1`. So a low count here does not prove August was fine; compare `requests`
per participant across days: a day with far fewer requests per participant than usual points to work that was
dropped before it ran. Times are
stored in UTC; the query shifts them to KST.

```
cd ~/lg_magazine
PW="$(sudo grep -E '^MSSQL_PASSWORD=' .env | cut -d= -f2- | tr -d '"')"
sudo docker compose exec -T mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$PW" -No -d lg_magazine -W -s "|" -Q "SELECT CONVERT(date, DATEADD(hour, 9, created_at)) AS day_kst, COUNT(*) AS requests, SUM(CASE WHEN calls = 0 THEN 1 ELSE 0 END) AS failed FROM dbo.llm_usage WHERE created_at >= '2026-07-31T15:00:00' AND created_at < '2026-08-31T15:00:00' GROUP BY CONVERT(date, DATEADD(hour, 9, created_at)) ORDER BY day_kst"
```

Which tasks failed most:

```
sudo docker compose exec -T mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$PW" -No -d lg_magazine -W -s "|" -Q "SELECT task, COUNT(*) AS requests, SUM(CASE WHEN calls = 0 THEN 1 ELSE 0 END) AS failed, AVG(ms) AS avg_ms, MAX(ms) AS max_ms FROM dbo.llm_usage WHERE created_at >= '2026-07-31T15:00:00' AND created_at < '2026-08-31T15:00:00' GROUP BY task ORDER BY failed DESC"
```

### 3b. Hyewon's test: 10/28 08:04 KST, nickname "test"

AI waits during her session (10/27 23:00 – 23:40 UTC = 10/28 08:00 – 08:40 KST):

```
sudo docker compose exec -T mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$PW" -No -d lg_magazine -W -s "|" -Q "SELECT DATEADD(hour, 9, created_at) AS at_kst, userid, task, calls, ms FROM dbo.llm_usage WHERE created_at >= '2026-10-27T23:00:00' AND created_at < '2026-10-27T23:40:00' ORDER BY created_at"
```

nginx log for the same window. First check the server clock's timezone and the log format:

```
date
sudo grep -rn "log_format\|access_log" /etc/nginx/
sudo ls -la /var/log/nginx/
```

If `date` shows KST, search `28/Oct/2026:08:[0-3]`; if it shows UTC, search `27/Oct/2026:23:[0-3]`
(08:00–08:39):

```
sudo zgrep -hE "28/Oct/2026:08:[0-3]" /var/log/nginx/access.log* | wc -l
sudo zgrep -hE "28/Oct/2026:08:[0-3]" /var/log/nginx/access.log* | awk '{print $9}' | sort | uniq -c
sudo zgrep -hE "28/Oct/2026:08:[0-3]" /var/log/nginx/access.log* | awk '$9 >= 400'
```

(`$9` is the status code in nginx's default `combined` format; adjust if `log_format` above differs.)

Look for 5xx or 429 status codes, and gaps. The default log format has no request time; if the log line ends
without a duration, the log can show *that* requests arrived, not how long they took.

### 3c. Network diagnostics script

Upload `scripts/vm-slowness-diagnostics.sh` (read-only checks) and run `sudo bash vm-slowness-diagnostics.sh`.
Send the output back for analysis.

## 4. Turn on HTTP/2 (fewer new connections per page)

Production answers HTTP/1.1 only (checked 2026-11-03, nginx 1.20.1). A page then opens up to 6 parallel
connections, and each new one can hit the 1–3 s stall. HTTP/2 uses one. On nginx 1.20 the syntax is
`listen 443 ssl http2;` (the separate `http2 on;` line only exists from nginx 1.25).

```
sudo grep -rn "listen.*443" /etc/nginx/
```

For each file listed, back it up, then add `http2` to the 443 lines. Replace `/etc/nginx/conf.d/FILE.conf` below
with the exact path the grep printed (it may live outside `conf.d`):

```
sudo cp /etc/nginx/conf.d/FILE.conf /root/FILE.conf.bak-20261104
sudo sed -i -E 's/listen(\s+)443 ssl;/listen\1443 ssl http2;/; s/listen(\s+)\[::\]:443 ssl;/listen\1[::]:443 ssl http2;/' /etc/nginx/conf.d/FILE.conf
sudo grep -n "listen.*443" /etc/nginx/conf.d/FILE.conf
sudo nginx -t
sudo systemctl reload nginx
```

Only reload if `nginx -t` says `syntax is ok` and `test is successful`. To undo: copy the backup back, `nginx -t`,
reload.

While in `/etc/nginx`, do **not** copy the repo's `deploy/nginx/*.conf` over the live files. Check the live
upstream is sticky: `sudo grep -rn "hash" /etc/nginx/conf.d/` should show `hash $cookie_qrius_session
consistent;`. Without it, 2 of 3 AI polls reach the wrong replica and participants get fallback text.

Check from your laptop (should print `2`):

```
curl -s -o /dev/null -w '%{http_version}\n' https://mybook.lgacademy.com/
```

If it still prints `1.1` while the server config is right, LG's security device is terminating TLS in front of
us and speaks only HTTP/1.1. Mention that to LG's network team (§6b).

## 5. AI capacity settings for 320 people

Check the queue settings (no secrets printed):

```
cd ~/lg_magazine
sudo grep -E '^(LLM_ASYNC|LLM_QUEUE_CONCURRENCY|LLM_QUEUE_HEAVY_MIN|LLM_QUEUE_HEAVY_AGING_MS|AISTUDIO_MAX_CONCURRENCY|AISTUDIO_LIGHT_MAX_CONCURRENCY|AISTUDIO_QUEUE_TIMEOUT_MS|AISTUDIO_OVERLOAD_RETRIES)=' .env
sudo grep -E '^AISTUDIO_API_CODES=' .env | cut -d= -f2- | tr ',' '\n' | wc -l
sudo grep -E '^AISTUDIO_LIGHT_API_CODES=' .env | cut -d= -f2- | tr ',' '\n' | wc -l
```

- `LLM_ASYNC` must be `1`.
- Total upstream load is `LLM_QUEUE_CONCURRENCY × 3 replicas` and must stay under the AI Studio account limit
  (~20 at once). The default 5 gives 15.
- `LLM_QUEUE_HEAVY_MIN` (new, default 1) is how many queue slots stay reserved for long writing per replica.
  `LLM_QUEUE_HEAVY_AGING_MS` (new, default 60000) is the head start quick replies get over long writing. If
  `llm_job_error` lines show `expired_in_queue` for long writing tasks, raise `LLM_QUEUE_HEAVY_MIN` to 2.
- Ask AI Studio (CEO) whether the daily token cap per API code covers ~320 full sessions in one day, and add
  API codes if not. A code that hits its daily cap is parked until the next day.

## 6. During and after each session

Count what participants saw (run after the session; `--since` covers the last 4 hours):

```
cd ~/lg_magazine
sudo docker compose logs --since 4h lg-magazine | grep -c '"evt":"llm_fallback"'
sudo docker compose logs --since 4h lg-magazine | grep -o '"evt":"llm_fallback","task":"[a-zA-Z]*"' | sort | uniq -c | sort -rn
sudo docker compose logs --since 4h lg-magazine | grep -c '"evt":"llm_job_error"'
sudo docker compose logs --since 4h lg-magazine | grep -c '"evt":"llm_job_slow"'
sudo docker compose logs --since 4h lg-magazine | grep -c '"evt":"llm_upstream_timeout"'
sudo docker compose logs --since 4h lg-magazine | grep -c '"evt":"llm_job_abandoned"'
```

`llm_upstream_timeout` counts AI Studio calls that took longer than the limit (35 s for short replies, 120 s for
writing) and were cut off and tried once more. Many of them mean AI Studio is slow or stuck that day.
`llm_job_abandoned` counts queued jobs dropped because the browser stopped asking (it already showed "다시 시도", or
the tab closed). Both exist only on builds after 2026-11-10.

Zero or near-zero `llm_fallback` means participants saw real AI answers. The count includes failures a participant
then fixed with "다시 시도", so it overstates what people finally saw. Before the cohort, check once that the report
arrives: with the browser's DevTools open on the site, a forced failure should show a `fallback` request with
status 204.

## 6b. Message drafts (Korean)

**CEO → 혜원님 (reply)**

> 혜원님, 시간 공유 감사합니다. 10/28 08:04 기준으로 서버 기록 대조 진행하겠습니다.
>
> 8월에 "준비된 답변만 말하는 것 같다"는 피드백은 가장 유력한 원인을 확인했습니다. AI 응답이 실패하거나 지연될 때 화면이
> 멈추지 않도록 기본 문장을 대신 보여주는 장치가 있었는데, 이 기본 문장이 참가자 답변과 상관없이 보였던 것으로 보입니다.
> 8월 실제 발생 건수는 서버 기록으로 확인 중입니다.
>
> 이번에 ① 실패 시 자동 재시도를 늘리고 ② 그래도 실패하면 기본 문장 대신 '다시 시도' 안내를 띄우며 ③ 실패 건수를 서버에서
> 집계할 수 있도록 수정했습니다. 마지막 차수 전에 반영하고 사전 점검까지 마치겠습니다.
>
> 새 접속 시 1~3초 대기는 서버 처리 단계(0.035초 이하)가 아니라 연결이 맺어지기 전 단계에서 발생하고 있어, 사내망 보안 장비
> 구간도 함께 확인이 필요해 보입니다. 네트워크 담당자분께 전달드릴 요청 내용을 따로 정리해 드리겠습니다.

**CEO → LG network/security team**

> 대상: mybook.lgacademy.com (203.247.146.226), TCP 443
>
> 현상: 새 연결을 맺을 때 1~3초 지연이 발생합니다 (TCP 연결 요청이 한 번 버려지고 1/2/3초 뒤 재시도되는 패턴). 연결이 맺어진
> 뒤 서버 응답은 0.035초 이하이고, 같은 시간대 80 포트와 이미 맺어진 연결에서는 지연이 없었습니다.
>
> 요청:
> 1. 해당 서버 443 구간 보안 장비(IPS / SSL 검사 / DDoS 방어)의 출발지 IP당 동시 연결 수·초당 신규 연결 제한, SYN 방어 임계치 확인
> 2. 마지막 차수(약 320명 동시 접속, 사내 공용 출구 IP 경유 예상) 진행 시간 동안 임계치 상향 또는 예외 처리
> 3. 10/28 08:00~08:40 해당 장비 로그에서 이 서버 대상 차단·지연 기록 확인
> 4. 해당 장비가 HTTPS를 중간에서 복호화하는 경우, HTTP/2 지원 여부 확인
