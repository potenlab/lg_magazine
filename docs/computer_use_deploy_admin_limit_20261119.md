# LG OWL: deploy the admin 200-session fix, 19 November (computer use guide)

Paste this into a Claude desktop chat with Computer use turned on:

> Read this guide and follow it: `https://raw.githubusercontent.com/potenlab/lg_magazine/production/docs/computer_use_deploy_admin_limit_20261119.md`. Use computer use on the "TILON MAC Linker" window.

(Or paste the whole file in directly.)

---

## The job

Redeploy the app on the production server of the LG OWL magazine (mybook.lgacademy.com) with one fix, approved by the user. **The bundle is already uploaded** to `/home/potenlab`.

| Part | What | Changes the live server? |
|---|---|---|
| 1 | Check the uploaded bundle | No (read-only) |
| 2 | Check nobody is in the middle of a session | No (read-only) |
| 3 | Redeploy the app with the new build | **Yes**, site down about 1 minute |
| 4 | Confirm the new build is live and the admin numbers are right | No (read-only) |

Do them in order. If any step fails or looks different from this guide, **stop and report**; don't improvise a fix.

**What the new build changes:** only the admin side. The admin page (응답 관리자), its Excel export and its per-cohort stats used to load only the **200 most recently updated sessions** (`SELECT TOP 200`). On 19 November, with 200+ MVP 6차 participants, MVP 4차 and 5차 showed 0 and 6차 stopped at 200. Now every session is loaded (`TOP 50000`, a safety cap). **Nothing changes for participants**: no text, no magazine layout, no AI behaviour, no database schema, no nginx setting. The data itself was never lost.

Expected numbers after the deploy (checked in the database on 19 November, 18:00 KST): **MVP 4차 59, MVP 5차 106, MVP 6차 204** (6차 can be higher if more people started since), plus 61 sessions in no cohort (미지정), 430 in total.

## Where things are

- On this Mac, the window **"TILON MAC Linker"** (app: DSMacLinker) shows LG's Windows virtual PC. Request computer use access to **DSMacLinker** only.
- Inside the virtual PC:
  - The **HIWARE terminal** window titled **"LGAPOTENLAB"** is a shell on the production server, as user `potenlab`.
  - **Microsoft Edge** for the admin page check (the user signs in).
- It's a remote screen, so the text is small; take a fresh screenshot before each click or typed command.
- Typing into the virtual PC can drop characters. If a typed command comes out wrong, put it on the Mac clipboard (`pbcopy`), switch to Finder and back to DSMacLinker (the VM only picks up a new clipboard after it regains focus), then right-click in the terminal to paste. Check the pasted line before pressing Enter.

## Rules for the whole job

1. Only touch what this guide names.
2. Never type a password, and never sign in anywhere. When `sudo` asks for a password, **stop and ask the user to type it**. The user signs in to the admin page themselves.
3. **Don't click the dark U-Cloud side panel** on the right (Cloud Disk, Recovery Manager, Desktop Setting, Close). Those can reset or close the virtual PC.
4. Ignore macOS pop-ups on the Mac itself.
5. If anything looks different from this guide (an unexpected dialog, an error, a fingerprint that doesn't match), stop and ask the user.

### HIWARE terminal rules (strict, the session gets blocked otherwise)

- Never type the `#` character, and never type the three-letter name of the remote-login tool (s, s, h), not even inside a search. Three flagged commands block the session.
- Type **one command at a time, exactly as written** in the boxes below. Each box is one command. Wait for it to finish and read the output before the next one.
- Copy every output into the chat as you go. The user passes your report to Claude Code.

---

## The new build

| | |
|---|---|
| File | `lg_magazine-images-20261119-150500-app.tar.gz` (176 MB) |
| sha256 | `bef43620a37dea8c8e82633e99ac219ab793fe655e639181cde5fd0e136845fa` |
| Image created | `2026-11-19T15:04:57.830319414+07:00` |
| Code | `production` branch, commit `5258b24` (only `src/lib/v3/session/serverStorage.ts` changed since the live build) |

The build that is live now (deployed 17 November) is `lg_magazine-images-20261117-154857-app.tar.gz`, image time `2026-11-17T15:48:54.496234447+07:00`. It stays on the server as the undo.

## Part 1: check the upload

```
ls -la ~/lg_magazine-images-20261119-150500-app.tar.gz
```
```
sha256sum ~/lg_magazine-images-20261119-150500-app.tar.gz
```
The fingerprint must be exactly `bef43620a37dea8c8e82633e99ac219ab793fe655e639181cde5fd0e136845fa`. If it differs, stop: the upload is broken. Ask the user to upload it again from `~/Desktop/lg-upload-20261119/` on the Mac.

Check the current build is still there (it is the undo):
```
ls -la ~/lg_magazine-images-20261117-154857-app.tar.gz
```
If it's missing, tell the user before going on.

List all bundles. The new one must have the newest date stamp in its name, because `redeploy.sh` picks the newest:
```
ls -la ~/lg_magazine-images-*.tar.gz
```

## Part 2: is anyone in the middle of a session? (read-only)

Redeploying drops everyone online for about a minute. Check who was active recently.

```
cd ~/lg_magazine
```
```
PW="$(sudo grep -E '^MSSQL_PASSWORD=' .env | cut -d= -f2- | tr -d '"')"
```
This stores the database password in a shell variable without printing it. Don't echo it. (If `sudo` asks for a password, stop and ask the user.)

Sessions saved in the last 10 minutes and the last 60 minutes:
```
sudo docker compose exec -T mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$PW" -No -d lg_magazine -W -s "|" -Q "SELECT SUM(CASE WHEN updated_at >= DATEADD(minute,-10,SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS active_10min, SUM(CASE WHEN updated_at >= DATEADD(minute,-60,SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS active_60min, DATEADD(hour,9,MAX(updated_at)) AS last_save_kst FROM dbo.v3_sessions"
```
```
unset PW
```

Report the three numbers and **ask the user: "N people saved in the last 10 minutes. Redeploy now? The site will be down for about a minute."** Wait for a clear yes. If `active_10min` is above 0, say so clearly; the user decides.

## Part 3: redeploy

```
cd ~/lg_magazine
```
```
sudo ./redeploy.sh
```
- `redeploy.sh` loads the newest bundle in the home folder (this one), recreates the 3 app copies, refreshes the static files and reloads nginx.
- It ends with **"Redeploy complete"** and a table of containers. It takes a few minutes; wait for it.
- If it stops with an error, copy the last 20 lines into the chat and stop.

## Part 4: confirm the new build is live

```
sudo docker image inspect lg-magazine:latest --format '{{.Created}}'
```
Must print `2026-11-19T15:04:57.830319414+07:00`.

```
sudo docker compose ps
```
Three `lg-magazine` rows and one `mssql` row, all **Up (healthy)**. Right after the redeploy they can show "starting"; wait 30 seconds and run it again.

Confirm the fix is in the code the app runs. This text exists only in the new build:
```
sudo docker compose exec -T lg-magazine sh -c "grep -rqsF 'TOP 50000 * FROM' /app/.next/server && echo FIX-PRESENT || echo FIX-MISSING"
```
It must print `FIX-PRESENT`. If it prints `FIX-MISSING`, report it and stop.

Also confirm the previous fix (17 November) is still in, since this build is on top of it:
```
sudo docker compose exec -T lg-magazine sh -c "grep -rqsF 'upstream error' /app/.next/server && echo OLD-FIX-PRESENT || echo OLD-FIX-MISSING"
```
It must print `OLD-FIX-PRESENT`.

HTTP/2 was turned on in an earlier session and redeploy doesn't touch it. Check it's still there:
```
sudo grep -rn "listen.*443" /etc/nginx/conf.d/
```
The 443 line should still end in `ssl http2;`.

### 4a. Admin page check (the user signs in, you read)

1. Ask the user to open `https://mybook.lgacademy.com/admin` in Edge in a fresh tab (or press Ctrl+F5), and sign in if asked.
2. Read the cohort tabs at the top. Expected:
   - **참여 세션** about 430 (no longer exactly 200)
   - **MVP 4차 (59)**, **MVP 5차 (106)**, **MVP 6차 (204 or more)**
3. Click **MVP 4차** and check the list shows people (not empty). Do the same for **MVP 5차**.
4. Report the numbers exactly as shown. Don't click any delete button, and don't change cohort settings.

Optional, only if the user wants: click the Excel download for **MVP 4차** and tell the user the file name; the user opens it and confirms it has about 59 rows.

### To undo

Only if something is broken and the user says to undo:
```
rm ~/lg_magazine-images-20261119-150500-app.tar.gz
```
```
cd ~/lg_magazine
```
```
sudo ./redeploy.sh
```
`redeploy.sh` then loads the newest bundle left, the 17 November one. Confirm with Part 4: its image time is `2026-11-17T15:48:54.496234447+07:00`.

---

## Final report to the user

1. Part 1: the file size and fingerprint (OK / not OK), whether the undo bundle is there, the bundle list.
2. Part 2: active in the last 10 / 60 minutes, last save time, and the user's go.
3. Part 3: "Redeploy complete" seen, or the error lines.
4. Part 4: image time, container status, `FIX-PRESENT`, `OLD-FIX-PRESENT`, the HTTP/2 line, and the admin numbers (참여 세션, 4차, 5차, 6차).
5. Anything that looked wrong, and any step you skipped and why.

The user passes this report to Claude Code, which then checks the numbers against the database count from 19 November.
