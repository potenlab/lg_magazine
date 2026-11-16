# LG OWL: deploy the magazine PDF column fix (computer use guide)

Paste this into a Claude desktop chat with Computer use turned on:

> Read this guide and follow it: `https://raw.githubusercontent.com/potenlab/lg_magazine/production/docs/computer_use_pdf_column_fix_20261116.md`. Use computer use on the "TILON MAC Linker" window.

---

## The job

Redeploy the app on the production server of the LG OWL magazine (mybook.lgacademy.com) with one fix, approved by the user.

| Part | What | Changes the live server? |
|---|---|---|
| 1 | Check the uploaded bundle | No (read-only) |
| 2 | Redeploy the app with the new build | **Yes**, site down about 1 minute |
| 3 | Confirm the new build is live | No (read-only) |

Do them in order. If any step fails or looks different from this guide, **stop and report**; don't improvise a fix.

**What the new build changes:** only the magazine PDF layout. Chapter pages put the article in two columns. When an article almost fit the left column, the last few words spilled to the top of the right column as a cut-off fragment (for example "말한 호기심이었다." alone in the right column of Chapter 2). Now, when the right column would get only one line, it starts at the beginning of that sentence instead. No text, AI behaviour, database or nginx setting changes.

The PDF is built in the browser at download time, so after this deploy any magazine downloaded again shows the fixed layout. Nothing needs to be regenerated.

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
| File | `lg_magazine-images-20261116-151156-app.tar.gz` (177 MB) |
| sha256 | `953070cd26e202ac2ff022a6406101214398849f30e67eebcb4de079022066d9` |
| Image created | `2026-11-16T15:11:54.757238424+07:00` |
| Code | `production` branch, commit `8f45396` |

The file is on the Mac in `~/Desktop/lg-upload-20261116-pdfcol/`.

The build that is live now (deployed 16 November, 13:56 KST) is `lg_magazine-images-20261116-105035-app.tar.gz`, image time `2026-11-16T10:49:46.684623789+07:00`. It stays on the server as the undo.

## Part 1: upload and check

### 1a. Upload (the user does this)

Ask the user to upload `lg_magazine-images-20261116-151156-app.tar.gz` from `~/Desktop/lg-upload-20261116-pdfcol/` to `/home/potenlab` with FileZilla, the same way as on 16 November. Wait until they say it's done.

### 1b. Check the upload

```
ls -la ~/lg_magazine-images-20261116-151156-app.tar.gz
```
```
sha256sum ~/lg_magazine-images-20261116-151156-app.tar.gz
```
The fingerprint must be exactly `953070cd26e202ac2ff022a6406101214398849f30e67eebcb4de079022066d9`. If it differs, stop: the upload is broken. Ask the user to upload it again.

Also check the current build is still there (it is the undo):
```
ls -la ~/lg_magazine-images-20261116-105035-app.tar.gz
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
Must print `2026-11-16T15:11:54.757238424+07:00`.

```
sudo docker compose ps
```
Three `lg-magazine` rows and one `mssql` row, all **Up (healthy)**. Right after the redeploy they can show "starting"; wait 30 seconds and run it again.

Check the fix is in the code browsers receive. This file name exists only in the new build:
```
sudo docker compose exec -T lg-magazine ls -la /app/.next/static/chunks/0el~o4xj47_sa.js
```
It should print one line with the file. If it says "No such file or directory", report it and stop.

HTTP/2 was turned on in the last session and redeploy doesn't touch it. Check it's still there:
```
sudo grep -rn "listen.*443" /etc/nginx/conf.d/
```
The 443 line should still end in `ssl http2;`.

### 3a. Quick test (the user does this)

Ask the user to:
1. Open mybook.lgacademy.com/admin in a fresh browser tab (or press Ctrl+F5 so the browser loads the new code).
2. Open participant **공원재** and click **요약본 PDF**.
3. On page 5 (Chapter 2, "풀어내는 사람"), the right column should now start with a whole sentence ("원인을 끝까지 따라가게 만드는 힘, …"), not "말한 호기심이었다." alone.

Then check nothing timed out:
```
sudo docker compose logs --since 15m lg-magazine | grep -c '"evt":"llm_upstream_timeout"'
```
Expect 0.

### To undo

```
rm ~/lg_magazine-images-20261116-151156-app.tar.gz
```
```
cd ~/lg_magazine
```
```
sudo ./redeploy.sh
```
`redeploy.sh` then loads the newest bundle left, the 16 November 10:50 one. Confirm with Part 3: its image time is `2026-11-16T10:49:46.684623789+07:00`.

---

## Final report to the user

1. Part 1: the file size and fingerprint (OK / not OK), and whether the undo bundle is there.
2. Part 2: "Redeploy complete" seen or the error lines.
3. Part 3: the image time, container status, the marker check, the HTTP/2 line, the user's page-5 result, the timeout count.
4. Anything that looked wrong, and any step you skipped and why.

The user will pass this report to Claude Code, which then checks from outside that the new code is served.
