# LG OWL: deploy the judgeBranch retry fix (computer use guide)

Paste this into a Claude desktop chat with Computer use turned on:

> Read this guide and follow it: `https://raw.githubusercontent.com/potenlab/lg_magazine/production/docs/computer_use_deploy_judgebranch_20261117.md`. Use computer use on the "TILON MAC Linker" window.

(Or paste the whole file in directly.)

---

## The job

Redeploy the app on the production server of the LG OWL magazine (mybook.lgacademy.com) with one fix, approved by the user.

| Part | What | Changes the live server? |
|---|---|---|
| 1 | Check the uploaded bundle | No (read-only) |
| 2 | Redeploy the app with the new build | **Yes**, site down about 1 minute |
| 3 | Confirm the new build is live | No (read-only) |

Do them in order. If any step fails or looks different from this guide, **stop and report**; don't improvise a fix.

**What the new build changes:** only one thing — how the magazine decides the next conversation path (an internal "branch judge"). Before, that step asked the AI twice and, if the AI call itself was busy at peak, gave up and used a rule-based backup. Now it asks up to four times and retries a busy/slow AI call before falling back. Effect: at 600-user peak the real AI answer is used far more often, and fewer answers come from the backup. **No text wording, no magazine layout, no database, no nginx setting changes.** The participant experience is unchanged; the backup still exists as a last resort, so the site can never error out.

Nothing needs to be regenerated — the change is server-side and takes effect as soon as the new build is running.

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

## The new build

| | |
|---|---|
| File | `lg_magazine-images-20261117-154857-app.tar.gz` (176 MB) |
| sha256 | `63904e8faf04675c6368474b20b98dec3ffa9f2d408813774242556f9be0711c` |
| Image created | `2026-11-17T15:48:54.496234447+07:00` |
| Code | `production` branch, commit `10d516f` |

The file is on the Mac in `~/Desktop/lg-upload-20261117-judgebranch/`.

The build that is live now (deployed 16 November) is `lg_magazine-images-20261116-151156-app.tar.gz`, image time `2026-11-16T15:11:54.757238424+07:00`. It stays on the server as the undo.

## Part 1: upload and check

### 1a. Upload (the user does this)

Ask the user to upload `lg_magazine-images-20261117-154857-app.tar.gz` from `~/Desktop/lg-upload-20261117-judgebranch/` to `/home/potenlab` with FileZilla, the same way as before. Wait until they say it's done.

### 1b. Check the upload

```
ls -la ~/lg_magazine-images-20261117-154857-app.tar.gz
```
```
sha256sum ~/lg_magazine-images-20261117-154857-app.tar.gz
```
The fingerprint must be exactly `63904e8faf04675c6368474b20b98dec3ffa9f2d408813774242556f9be0711c`. If it differs, stop: the upload is broken. Ask the user to upload it again.

Also check the current build is still there (it is the undo):
```
ls -la ~/lg_magazine-images-20261116-151156-app.tar.gz
```
If it's missing, tell the user before going on.

## Part 2: redeploy

### 2a. Pick the moment

Redeploying makes the site unavailable for about a minute. Ask the user once: **"Redeploy now? The site will be down for about a minute."** Wait for yes. Don't redeploy while an LG session is running.

### 2b. Redeploy

```
cd ~/lg_magazine
```
```
sudo ./redeploy.sh
```
- `redeploy.sh` loads the newest bundle in the home folder (this one), recreates the 3 app copies, refreshes the static files and reloads nginx.
- It ends with **"Redeploy complete"** and a table of containers. It takes a few minutes; wait for it.
- If it stops with an error, copy the last 20 lines into the chat and stop.

## Part 3: confirm the new build is live

```
sudo docker image inspect lg-magazine:latest --format '{{.Created}}'
```
Must print `2026-11-17T15:48:54.496234447+07:00`.

```
sudo docker compose ps
```
Three `lg-magazine` rows and one `mssql` row, all **Up (healthy)**. Right after the redeploy they can show "starting"; wait 30 seconds and run it again.

Confirm the fix is in the code the app runs. This text exists only in the new build:
```
sudo docker compose exec -T lg-magazine sh -c "grep -rqsF 'upstream error' /app/.next/server && echo FIX-PRESENT || echo FIX-MISSING"
```
It must print `FIX-PRESENT`. If it prints `FIX-MISSING`, report it and stop.

HTTP/2 was turned on in an earlier session and redeploy doesn't touch it. Check it's still there:
```
sudo grep -rn "listen.*443" /etc/nginx/conf.d/
```
The 443 line should still end in `ssl http2;`.

### 3a. Quick check (the user does this)

Ask the user to open mybook.lgacademy.com in a fresh tab (or press Ctrl+F5), sign in, and answer the first question of Chapter 1. The editor's reply should appear in a few seconds, as before — the change is invisible to participants.

Then check nothing timed out:
```
sudo docker compose logs --since 15m lg-magazine | grep -c '"evt":"llm_upstream_timeout"'
```
Expect 0.

### To undo

```
rm ~/lg_magazine-images-20261117-154857-app.tar.gz
```
```
cd ~/lg_magazine
```
```
sudo ./redeploy.sh
```
`redeploy.sh` then loads the newest bundle left, the 16 November one. Confirm with Part 3: its image time is `2026-11-16T15:11:54.757238424+07:00`.

---

## Final report to the user

1. Part 1: the file size and fingerprint (OK / not OK), and whether the undo bundle is there.
2. Part 2: "Redeploy complete" seen or the error lines.
3. Part 3: the image time, container status, the `FIX-PRESENT` check, the HTTP/2 line, the user's Chapter-1 result, the timeout count.
4. Anything that looked wrong, and any step you skipped and why.

The user will pass this report to Claude Code, which then checks from outside that the new code is served, and (optionally) re-runs the 600-user load test to measure the new fallback number.
