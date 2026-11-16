# LG OWL: server session of 16 November (computer use guide)

Paste this into a Claude desktop chat with Computer use turned on:

> Read this guide and follow it: `https://raw.githubusercontent.com/potenlab/lg_magazine/production/docs/computer_use_server_session_20261116.md`. Use computer use on the "TILON MAC Linker" window.

---

## The job

Four steps on the production server of the LG OWL magazine (mybook.lgacademy.com), approved by the user, in this order:

| Part | What | Changes the live server? |
|---|---|---|
| 1 | Count AI failures in August | No (read-only) |
| 2 | Look at Hyewon's test on 28 October, 08:00–08:40 KST | No (read-only) |
| 3 | Redeploy the app with the 16 November build | **Yes**, site down about 1 minute |
| 4 | Turn on HTTP/2 in nginx | **Yes**, a config reload |

Do them in order. If any step fails or looks different from this guide, **stop and report**; don't improvise a fix.

**What the new build changes:** on the follow-up screens (about 10 in chapters 1–4), when the AI's short reply fails, participants no longer all see the same canned sentence ("'…' — 그 결을 잠시 머물러 듣고 있어요."). They see the next question, or a plain closing line. Every AI reply is also cleaned of stray characters (like the "Ƭ" seen on 10 November).

**Why HTTP/2:** a page now opens up to 6 new connections, and in Korean working hours about 1 in 8 new connections stalls for 1–3 s (measured 16 November). HTTP/2 needs one connection per page.

## Where things are

- On this Mac, the window **"TILON MAC Linker"** (app: DSMacLinker) shows LG's Windows virtual PC. Request computer use access to **DSMacLinker** only.
- Inside the virtual PC:
  - The **HIWARE terminal** window titled **"LGAPOTENLAB"** is a shell on the production server, as user `potenlab`.
  - **FileZilla** uploads files to the server's `/home/potenlab` (the user does uploads).
- It's a remote screen, so the text is small; take a fresh screenshot before each click or typed command.

## Rules for the whole job

1. Only touch what this guide names.
2. Never type a password, and never sign in anywhere. When `sudo` asks for a password, **stop and ask the user to type it**.
3. **Don't click the dark U-Cloud side panel** on the right (Cloud Disk, Recovery Manager, Desktop Setting, Close). Those can reset or close the virtual PC.
4. Ignore macOS pop-ups on the Mac itself.
5. If anything looks different from this guide (an unexpected dialog, an error, a fingerprint that doesn't match), stop and ask the user.

### HIWARE terminal rules (strict, the session gets blocked otherwise)

- Never type the `#` character, and never type the three-letter name of the remote-login tool (s, s, h), not even inside a search. Three flagged commands block the session.
- Type **one command at a time, exactly as written** in the boxes below. Each box is one command. Wait for it to finish and read the output before the next one.
- Copy every output into the chat as you go. The user passes your report to Claude Code.

---

## Part 1: AI failures in August (read-only)

```
cd ~/lg_magazine
```
```
PW="$(sudo grep -E '^MSSQL_PASSWORD=' .env | cut -d= -f2- | tr -d '"')"
```
This stores the database password in a shell variable without printing it. Don't echo it.

Failures per day (times are shifted to KST):
```
sudo docker compose exec -T mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$PW" -No -d lg_magazine -W -s "|" -Q "SELECT CONVERT(date, DATEADD(hour, 9, created_at)) AS day_kst, COUNT(*) AS requests, SUM(CASE WHEN calls = 0 THEN 1 ELSE 0 END) AS failed FROM dbo.llm_usage WHERE created_at >= '2026-07-31T15:00:00' AND created_at < '2026-08-31T15:00:00' GROUP BY CONVERT(date, DATEADD(hour, 9, created_at)) ORDER BY day_kst"
```

Failures per task:
```
sudo docker compose exec -T mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$PW" -No -d lg_magazine -W -s "|" -Q "SELECT task, COUNT(*) AS requests, SUM(CASE WHEN calls = 0 THEN 1 ELSE 0 END) AS failed, AVG(ms) AS avg_ms, MAX(ms) AS max_ms FROM dbo.llm_usage WHERE created_at >= '2026-07-31T15:00:00' AND created_at < '2026-08-31T15:00:00' GROUP BY task ORDER BY failed DESC"
```
Copy both tables into the chat in full.

## Part 2: Hyewon's test, 28 October 08:00–08:40 KST (read-only)

AI calls in that window:
```
sudo docker compose exec -T mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$PW" -No -d lg_magazine -W -s "|" -Q "SELECT DATEADD(hour, 9, created_at) AS at_kst, userid, task, calls, ms FROM dbo.llm_usage WHERE created_at >= '2026-10-27T23:00:00' AND created_at < '2026-10-27T23:40:00' ORDER BY created_at"
```

Then the nginx log. First the server clock and log setup:
```
date
```
```
sudo grep -rn "log_format\|access_log" /etc/nginx/
```
```
sudo ls -la /var/log/nginx/
```

If `date` printed **KST**, run these three. The whole command runs inside `sudo sh -c` because user `potenlab` can't list `/var/log/nginx`, so a plain `access.log*` would never expand (found on 16 November):
```
sudo sh -c 'zcat -f /var/log/nginx/access.log*' | grep -E "28/Oct/2026:08:[0-3]" | wc -l
```
```
sudo sh -c 'zcat -f /var/log/nginx/access.log*' | grep -E "28/Oct/2026:08:[0-3]" | awk '{print $9}' | sort | uniq -c
```
```
sudo sh -c 'zcat -f /var/log/nginx/access.log*' | grep -E "28/Oct/2026:08:[0-3]" | awk '$9 >= 400'
```

If `date` printed **UTC**, run the same three with `27/Oct/2026:23:[0-3]` in place of `28/Oct/2026:08:[0-3]`.

Two limits found on 16 November: the server keeps only about 10 days of nginx logs, and `/etc/nginx/conf.d/lg-book.conf` has `access_log off;` for most locations, so most site requests are never logged.

If the first one prints `0`, the 28 October logs were probably rotated away. Report that; it's an answer too. If the last one prints many lines, copy only the first 30.

---

## Part 3: redeploy the 16 November build

### The new build

| | |
|---|---|
| File | `lg_magazine-images-20261116-105035-app.tar.gz` (176 MB) |
| sha256 | `65010c49de8bf994215a5af1bbd61e76857804932cec532d6b6dca0756c5b334` |
| Image created | `2026-11-16T10:49:46.684623789+07:00` |
| Code | `production` branch, commit `f9e51d4` |

The file is on the Mac in `~/Desktop/lg-upload-20261116/`.

### 3a. Upload (the user does this)

Ask the user to upload `lg_magazine-images-20261116-105035-app.tar.gz` from `~/Desktop/lg-upload-20261116/` to `/home/potenlab` with FileZilla, the same way as on 10 November. Wait until they say it's done.

### 3b. Check the upload

```
ls -la ~/lg_magazine-images-20261116-105035-app.tar.gz
```
```
sha256sum ~/lg_magazine-images-20261116-105035-app.tar.gz
```
The fingerprint must be exactly `65010c49de8bf994215a5af1bbd61e76857804932cec532d6b6dca0756c5b334`. If it differs, stop: the upload is broken. Ask the user to upload it again.

Also check the previous build is still there (it is the undo):
```
ls -la ~/lg_magazine-images-20261110-141158-app.tar.gz
```
If it's missing, tell the user before going on.

### 3c. Pick the moment

Redeploying makes the site unavailable for about a minute. Ask the user once: **"Redeploy now? The site will be down for about a minute."** Wait for yes. Don't redeploy while an LG session is running.

### 3d. Redeploy

```
cd ~/lg_magazine
```
```
sudo ./redeploy.sh
```
- `redeploy.sh` loads the newest bundle in the home folder (this one), recreates the 3 app copies, refreshes the static files and reloads nginx.
- It ends with **"Redeploy complete"** and a table of containers. It takes a few minutes; wait for it.
- If it stops with an error, copy the last 20 lines into the chat and stop.

### 3e. Confirm the new build is live

```
sudo docker image inspect lg-magazine:latest --format '{{.Created}}'
```
Must print `2026-11-16T10:49:46.684623789+07:00`.

```
sudo docker compose ps
```
Three `lg-magazine` rows and one `mssql` row, all **Up (healthy)**. Right after the redeploy they can show "starting"; wait 30 seconds and run it again.

Check the new code is in the running app (the stray-character filter is in it):
```
sudo docker compose exec -T lg-magazine grep -rlF "uE000-" /app/.next/static/chunks
```
It should print at least one file name. If it prints nothing, report it and stop.

### 3f. Quick test (the user does this)

Ask the user to open mybook.lgacademy.com in a fresh browser tab, log in, and answer the first question of Chapter 1. The editor's reply should appear in a few seconds, as before. Then check nothing timed out:
```
sudo docker compose logs --since 15m lg-magazine | grep -c '"evt":"llm_upstream_timeout"'
```
Expect 0.

### To undo Part 3

```
rm ~/lg_magazine-images-20261116-105035-app.tar.gz
```
```
cd ~/lg_magazine
```
```
sudo ./redeploy.sh
```
`redeploy.sh` then loads the newest bundle left, the 10 November one. Confirm with 3e: its image time starts with `2026-11-10T14:11:55`.

---

## Part 4: turn on HTTP/2 (nginx)

The live nginx is version 1.20, where the syntax is `listen 443 ssl http2;`. Do **not** copy any nginx files from the repo over the live ones.

### 4a. Find the files

```
sudo grep -rn "listen.*443" /etc/nginx/
```
Copy the output into the chat. Each line shows `path:line: listen ...`. Write down each **different path**. If a line already contains `http2`, HTTP/2 is already on in that file; skip it.

### 4b. Change each file

For **each** path from 4a (below, `/etc/nginx/conf.d/FILE.conf` stands for the exact path you saw, and `FILE.conf` for its file name). First a backup:
```
sudo cp /etc/nginx/conf.d/FILE.conf /root/FILE.conf.bak-20261116
```
Then the change:
```
sudo sed -i -E 's/listen(\s+)443 ssl;/listen\1443 ssl http2;/; s/listen(\s+)\[::\]:443 ssl;/listen\1[::]:443 ssl http2;/' /etc/nginx/conf.d/FILE.conf
```
Then look:
```
sudo grep -n "listen.*443" /etc/nginx/conf.d/FILE.conf
```
Every 443 line should now end in `ssl http2;`. If a line looks different (for example `listen 443 ssl default_server;`), it wasn't changed; report it and ask the user before editing anything by hand.

### 4c. Test the config, then reload

```
sudo nginx -t
```
**Only continue if it prints both `syntax is ok` and `test is successful`.** If not, put every backup back (next section) and stop.

```
sudo systemctl reload nginx
```

Check the sticky setting is still there (AI replies depend on it):
```
sudo grep -rn "hash" /etc/nginx/conf.d/
```
Must show `hash $cookie_qrius_session consistent;`.

### To undo Part 4

For each file you changed:
```
sudo cp /root/FILE.conf.bak-20261116 /etc/nginx/conf.d/FILE.conf
```
Then:
```
sudo nginx -t
```
```
sudo systemctl reload nginx
```

---

## Final report to the user

1. Part 1: both August tables, in full.
2. Part 2: the 10/28 AI-call table, the `date` output, and the three nginx log results (or "logs rotated away").
3. Part 3: 3b fingerprint OK / not OK, the 3e image time, container status and the filter check, the 3f timeout count.
4. Part 4: the 4a lines before, the lines after, the `nginx -t` result, and the sticky check.
5. Anything that looked wrong, and any step you skipped and why.

The user will pass this report to Claude Code. Claude Code then checks from outside that the site speaks HTTP/2 and the new build is served. If the site still answers HTTP/1.1 while the config is right, LG's security device is ending the encrypted connection in front of the server, and LG's network team has to be asked.
