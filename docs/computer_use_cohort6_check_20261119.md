# LG OWL: MVP 6차 data and AI-failure check, 19 November (computer use guide)

Paste this into a Claude desktop chat with Computer use turned on:

> Read this guide and follow it: `https://raw.githubusercontent.com/potenlab/lg_magazine/docs/cohort6-check-20261119/docs/computer_use_cohort6_check_20261119.md`. Use computer use on the "TILON MAC Linker" window.

---

## The job

**Everything in this guide is read-only. Do not deploy, restart, edit, delete or change any setting.**
The MVP 6차 session (started 16:00 KST, 200+ participants) may still be running. The CEO asked: *"don't deploy, only check the data & issue."*

| Part | What | Changes anything? |
|---|---|---|
| 1 | AI Studio: read why 4 calls failed today | No |
| 2 | Database: real session counts per cohort | No |
| 3 | Database: did any participant get a failed AI reply today | No |
| 4 | Server log: error text of failed AI calls | No |

Do them in order. If a step fails or looks different from this guide, **stop and report**; don't improvise.

### Background (so you know what you're looking at)

1. **Admin page shows only 200 sessions.** The admin page (응답 관리자) and its Excel export load only the 200 most recently updated sessions (`SELECT TOP 200`). With 200+ MVP 6차 participants active, MVP 4차 and 5차 show **0** and "응답 시작" stops at **200**. We believe the data is all still in the database; Part 2 checks that. A fix (TOP 50000) is built but **not deployed**, and must not be deployed during this job.
2. **4 failed AI calls in AI Studio.** The AI Studio call history (AI 프롬프트 스튜디오 호출 이력), filtered to 2026-11-19 and 상태 = 실패, shows 4 rows. All are on the same Gemini 3 Flash API used for short replies, at **15:57:42, 16:03:56, 16:04:02, 16:12:28** KST. The app retries a failed call automatically (up to 3 times on a 500 or 429, once on a timeout, and switches to another API on a quota error), so a failed row in AI Studio does not necessarily mean a participant saw an error. Parts 1, 3 and 4 find out the reason and whether anyone was affected.

## Where things are

- On this Mac, the window **"TILON MAC Linker"** (app: DSMacLinker) shows LG's Windows virtual PC. Request computer use access to **DSMacLinker** only.
- Inside the virtual PC:
  - **Microsoft Edge** is already signed in to LG AI Studio (aistudio.singlex.com).
  - The **HIWARE terminal** window titled **"LGAPOTENLAB"** is a shell on the production server, as user `potenlab`.
- It's a remote screen, so the text is small; take a fresh screenshot before each click or typed command.
- Typing into the virtual PC can drop characters. If a typed command comes out wrong, put it on the Mac clipboard (`pbcopy`), click into the terminal, and paste instead. Check the pasted line before pressing Enter.

## Rules for the whole job

1. Only touch what this guide names. **Read only**: no saving, no settings, no quota changes, no deletes, no restarts.
2. Never type a password, and never sign in anywhere. When `sudo` asks for a password, **stop and ask the user to type it**. If AI Studio asks you to sign in, stop and ask the user.
3. **Don't click the dark U-Cloud side panel** on the right (Cloud Disk, Recovery Manager, Desktop Setting, Close). Those can reset or close the virtual PC.
4. Ignore macOS pop-ups on the Mac itself.
5. If anything looks different from this guide, stop and ask the user.

### HIWARE terminal rules (strict, the session gets blocked otherwise)

- Never type the `#` character, and never type the three-letter name of the remote-login tool (s, s, h), not even inside a search. Three flagged commands block the session.
- Type **one command at a time, exactly as written** in the boxes below. Each box is one command. Wait for it to finish and read the output before the next one.
- Copy every output into the chat as you go. The user passes your report to Claude Code.

---

## Part 1: why the 4 AI Studio calls failed (read-only)

1. In Edge, open the AI Studio tab and go to **AI 프롬프트 스튜디오 호출 이력** (call history).
2. Set the filters: **API 호출일시** = 2026.11.19 ~ 2026.11.19, **상태** = 실패, the rest 전체. Click **검색**.
3. Confirm the list shows **총 4 건** with the times above. If the count is different, report the new count and all rows.
4. Click each of the 4 rows, one at a time. For each, report:
   - the time,
   - the API name,
   - the **error message / response body** exactly as shown (the Korean text matters),
   - any HTTP status code, duration or token count shown.
   Then close the detail view without changing anything.
5. Change only **상태** to 전체 and click **검색**. Report the **총 N 건** (total calls today), for the failure rate. Don't open rows.

What the message usually means (just report it; don't act on it):
- contains **"토큰 호출량 한도를 초과"** → a quota limit (per-minute if it mentions 분)
- a 500 / server error → AI Studio overloaded at peak
- a timeout → the model took too long

## Part 2: real session counts per cohort (read-only)

In the HIWARE terminal:

```
cd ~/lg_magazine
```
```
PW="$(sudo grep -E '^MSSQL_PASSWORD=' .env | cut -d= -f2- | tr -d '"')"
```
This stores the database password in a shell variable without printing it. Don't echo it. (If `sudo` asks for a password, stop and ask the user.)

Sessions per cohort, matched the same way the admin page does it (no 200 limit):
```
sudo docker compose exec -T mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$PW" -No -d lg_magazine -W -s "|" -Q "SELECT ISNULL(c.name,N'미지정') AS cohort, COUNT(*) AS started, SUM(CASE WHEN s.status='completed' THEN 1 ELSE 0 END) AS completed, SUM(CASE WHEN s.status='in_progress' THEN 1 ELSE 0 END) AS in_progress FROM dbo.v3_sessions s OUTER APPLY (SELECT TOP 1 name FROM dbo.cohort_rules r WHERE s.created_at BETWEEN r.start_at AND r.end_at ORDER BY r.start_at DESC) c GROUP BY c.name ORDER BY MIN(s.created_at)"
```

Total rows:
```
sudo docker compose exec -T mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$PW" -No -d lg_magazine -W -Q "SELECT COUNT(*) AS total_sessions FROM dbo.v3_sessions"
```

Cohort time windows (to make sure the 4차/5차/6차 rules are what we expect):
```
sudo docker compose exec -T mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$PW" -No -d lg_magazine -W -s "|" -Q "SELECT name, DATEADD(hour,9,start_at) AS start_kst, DATEADD(hour,9,end_at) AS end_kst FROM dbo.cohort_rules ORDER BY start_at"
```

Expected: MVP 4차 and 5차 show their earlier counts (not 0), and MVP 6차 can be above 200. Report the outputs as they are.

## Part 3: did any participant get a failed AI reply today (read-only)

A row with `calls = 0` means every retry failed and the participant got a fallback instead of an AI reply.

Failed AI requests today (from 00:00 KST), with the participant's name and where they were in the flow:
```
sudo docker compose exec -T mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$PW" -No -d lg_magazine -W -s "|" -Q "SELECT DATEADD(hour,9,u.created_at) AS at_kst, u.task, u.tier, u.ms, s.user_name, s.status, s.last_scene_id FROM dbo.llm_usage u LEFT JOIN dbo.v3_sessions s ON s.session_id = u.session_id WHERE u.created_at >= '2026-11-18T15:00:00' AND u.calls = 0 ORDER BY u.created_at"
```
The CEO reports that **4 participants** were affected. Check whether this list has 4 distinct names, and report them.

Totals today, for the rate:
```
sudo docker compose exec -T mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$PW" -No -d lg_magazine -W -s "|" -Q "SELECT tier, COUNT(*) AS requests, SUM(CASE WHEN calls=0 THEN 1 ELSE 0 END) AS failed, AVG(ms) AS avg_ms, MAX(ms) AS max_ms FROM dbo.llm_usage WHERE created_at >= '2026-11-18T15:00:00' GROUP BY tier"
```

If the first query returns no rows, no participant was affected: the 4 AI Studio failures were all fixed by retries.

## Part 4: server log for failed AI calls (read-only)

```
sudo docker compose logs --since 3h lg-magazine 2>&1 | grep -E 'aistudio|llm_upstream_timeout' | tail -30
```

Report the lines as they are. Don't paste anything that looks like a password or token; if you see one, write `[hidden]` instead.

When done, clear the password variable:
```
unset PW
```

---

## Report back

Give the user one block with:

1. Part 1: for each of the 4 failures: time, API, error message; plus today's total call count.
2. Part 2: the per-cohort table, total rows, the cohort time windows.
3. Part 3: the failed-request rows (or "none") and the totals per tier.
4. Part 4: the log lines (or "no matching lines").
5. Anything that looked different from this guide.

Nothing was changed on the server or in AI Studio. Don't deploy the fix; that happens later, after the session, with the user's go.
