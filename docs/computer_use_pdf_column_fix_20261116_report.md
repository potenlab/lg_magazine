# LG OWL: magazine PDF column fix deploy — report

This is the result of running [`computer_use_pdf_column_fix_20261116.md`](./computer_use_pdf_column_fix_20261116.md) on the production server of mybook.lgacademy.com. It was written by the Claude session that did the work through computer use, for the agents that pick this up next.

Session time: 16 November 2026, about 17:22–17:56 KST. The redeploy itself completed at about 17:54 KST.

## Status

| Part | What | Result |
|---|---|---|
| 1 | Upload and check the bundle | Done. Fingerprint matches. |
| 2 | Redeploy | Done. "Redeploy complete ✓". |
| 3 | Confirm the new build is live | Done on the server and from outside. |
| 3a | User's page-5 PDF check | **Not done yet.** |

**Open:** nobody has yet looked at a downloaded PDF. The fix itself (the right column of Chapter 2 starting with a whole sentence) is unconfirmed until the user's check in 3a.

**How to read the values:** server output was read off a small remote screen, where `1` and `l` look alike. The fingerprint and the marker file size were each confirmed a second way (see below).

---

## Part 1: upload and check

| Check | Result |
|---|---|
| File on the Mac | `lg_magazine-images-20261116-151156-app.tar.gz`, 168,590,237 bytes |
| Fingerprint on the Mac | `953070cd26e202ac2ff022a6406101214398849f30e67eebcb4de079022066d9` |
| Upload | FileZilla: "File transfer successful, transferred 168,590,237 bytes" |
| File on the server | `-rw-r--r--. 1 potenlab potenlab 168590237 11월 16 17:50` |
| Fingerprint on the server | `953070cd26e202ac2ff022a6406101214398849f30e67eebcb4de079022066d9` — matches the guide |
| Undo bundle | `lg_magazine-images-20261116-105035-app.tar.gz` is there, 168,590,847 bytes, 13:47 |

The user asked the session to do the upload itself rather than doing it by hand.

## Part 2: redeploy

The user said "Yes, redeploy now" and typed the sudo password. `sudo ./redeploy.sh` printed, in order:

- Loaded image bundle `lg_magazine-images-20261116-151156-app.tar.gz`.
- Recreated the three app copies (mssql left running).
- Applied five schema files (`cohort_rules`, `llm_usage`, `qrius_logins`, `v3_sessions`, `v3_sessions_userid`).
- Extracted static assets to `/var/www/lg_magazine_public` (107M).
- Reloaded nginx: `syntax is ok`, `test is successful`.
- "Redeploy complete ✓".

## Part 3: confirm

| Check | Result |
|---|---|
| Image time | `2026-11-16T15:11:54.757238424+07:00` — matches the guide |
| `sudo docker compose ps` | `lg-magazine-1`, `-2`, `-3`: Up about a minute (healthy). `mssql-1`: Up 4 months (healthy) |
| Marker file | `-rw-rw-r--. 1 nextjs nodejs 48557 Nov 16 08:11 /app/.next/static/chunks/0el~o4xj47_sa.js` |
| HTTP/2 line | `/etc/nginx/conf.d/lg-book.conf:63: listen 443 ssl http2;` — still on after the redeploy |
| Timeout count | `0` |

The timeout count was run without the user's PDF test. It only covers the minutes right after the redeploy.

### Check from outside

Run from the Mac right after the server checks:

```
curl -sI --http2 -m 15 https://mybook.lgacademy.com/ -o /dev/null -w 'http_version=%{http_version} status=%{http_code} time=%{time_total}\n'
http_version=2 status=307 time=0.569234

curl -s -m 15 -o /dev/null -w 'marker_status=%{http_code} size=%{size_download}\n' 'https://mybook.lgacademy.com/_next/static/chunks/0el~o4xj47_sa.js'
marker_status=200 size=48557
```

The site answers over HTTP/2, and the file that exists only in the new build is served to the public with the same size as inside the container (48,557 bytes).

### 3a: still to do (the user)

1. Open mybook.lgacademy.com/admin in a fresh tab, or press Ctrl+F5.
2. Open participant 공원재 and click 요약본 PDF.
3. On page 5 (Chapter 2, "풀어내는 사람"), the right column should start with a whole sentence ("원인을 끝까지 따라가게 만드는 힘, …"), not "말한 호기심이었다." alone.

To undo, follow "To undo" in the guide. The 10:50 bundle is in place for it; its image time is `2026-11-16T10:49:46.684623789+07:00`.

---

## What went wrong or differed from the guide

1. **A stray paste reached the production terminal.** Between copying a command and pasting it, another program on the Mac replaced the clipboard with five lines of Korean notes (about an upload bug and a QA sheet). They were pasted into the server shell. Because the text had line breaks, the shell tried each line at once, before it could be read. All five failed: four "명령어를 찾을 수 없음" (command not found) and one syntax error. Nothing ran, but the text is in that terminal's history. The same clipboard overwrite happened once in the earlier session and was caught that time.
2. **FileZilla's queue was cleared.** The new FileZilla window opened with three old bundles already queued for upload (about 1.6 GiB, from June and July). Uploading the new file would have sent them too, and `redeploy.sh` loads the newest bundle in the home folder. The three queue entries were removed with "Stop and remove all". The files themselves were not touched.
3. **The copy into the virtual PC failed once** with "The remote procedure call failed", then worked on the retry.
4. **FileZilla had to be started three times.** The window left from the morning could not connect (its HIWARE tunnel was gone). The second attempt timed out while an "unknown host key" dialog waited for the user. The third connected. The user accepted the host key dialog; the fingerprint shown was `SHA256:KHn534edhpB2HQJz9HVD9Xk0qyrNah58i6RK5M1gvxM` for `127.0.0.1:13000` (HIWARE's local tunnel).
5. **One listing instead of two.** Both bundle files were checked with a single `ls -la` rather than the guide's two commands.

## Notes for the next agent using computer use on this virtual PC

These add to the notes in [`computer_use_server_session_20261116_report.md`](./computer_use_server_session_20261116_report.md).

- **Guard every paste.** Read the Mac clipboard immediately before the paste action, and never put the paste and Enter in one batch. A multi-line clipboard runs in the shell without Enter, so the check before pasting is the only protection. Other sessions on this Mac copy text at any time.
- **HIWARE tunnels are one-time.** After the virtual PC is closed or a session idles out, the old FileZilla and terminal windows are dead. Start new ones from HIWARE: right-click LGAPOTENLAB, then `SFTP_22 [SFTP]` → `Filezilla`, or `SSH_22 [SSH]` for the terminal. Each asks for the `potenlab` password, which only the user may type.
- **Answer FileZilla's dialogs quickly.** A new FileZilla session shows an update notice (Close it) and then an unknown-host-key dialog. If that dialog waits a few minutes, the connection fails and the session has to be started again.
- **Check FileZilla's queue before uploading.** It can restore old queued transfers; double-clicking a file processes the whole queue.
- **File copy by clipboard can fail partway.** Retry it; check the byte count in FileZilla's local pane before uploading.

## Left behind

- A copy of the new bundle in the virtual PC's `D:\`.
- Five failed lines of Korean text in the server terminal's history.
- A minimized File Explorer window in the virtual PC.
