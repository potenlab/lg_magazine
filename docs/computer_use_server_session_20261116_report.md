# LG OWL: server session of 16 November — report

This is the result of running [`computer_use_server_session_20261116.md`](./computer_use_server_session_20261116.md) on the production server of mybook.lgacademy.com. It was written by the Claude session that did the work through computer use, for the agents that pick this up next.

Session time: 16 November 2026, about 13:28–14:01 KST.

## Status

| Part | What | Result |
|---|---|---|
| 1 | AI failures in August | Done. 4 failures in 3,284 requests. |
| 2 | Hyewon's test, 28 October 08:00–08:40 KST | Done. 9 of 17 `reflectShort` calls failed. nginx logs for that day no longer exist. |
| 3 | Redeploy the 16 November build | Done. New build is live, all containers healthy. |
| 4 | HTTP/2 in nginx | Done. On, and confirmed from outside. |

**Open:** the 3f browser test (log in, answer the first question of Chapter 1) has not been reported by the user. No real AI reply on the new build has been seen yet.

**How to read the numbers:** every server value below was read off a small remote screen. In that font `1` and `l` look alike, so file names and hashes could have a misread character. The two August tables add up to the same total (3,284), and the upload was checked by byte count as well as by fingerprint.

---

## Part 1: AI failures in August

Query window: `created_at >= '2026-07-31T15:00:00'` and `< '2026-08-31T15:00:00'` (August in KST).

Per day (KST):

| day_kst | requests | failed |
|---|---|---|
| 2026-08-03 | 3 | 0 |
| 2026-08-13 | 3198 | 4 |
| 2026-08-14 | 55 | 0 |
| 2026-08-26 | 28 | 0 |

Per task:

| task | requests | failed | avg_ms | max_ms |
|---|---|---|---|---|
| reflectShort | 1131 | 3 | 11794 | 36256 |
| writeCoverHeadline | 221 | 1 | 2496 | 9846 |
| writeChapterArticle | 302 | 0 | 9684 | 16636 |
| synthesizeStrength | 84 | 0 | 11700 | 17443 |
| reflectStrength | 4 | 0 | 11005 | 16161 |
| comfortReassure | 28 | 0 | 7851 | 12408 |
| writeEditorNote | 442 | 0 | 5851 | 14594 |
| generateTimeHorizon | 4 | 0 | 3865 | 4360 |
| reflectPoetic | 95 | 0 | 9702 | 32610 |
| synthesizeGrowthVision | 77 | 0 | 15270 | 21114 |
| extractKeyword | 4 | 0 | 4513 | 6504 |
| judgeBranch | 718 | 0 | 3524 | 12567 |
| reflectValues | 84 | 0 | 10163 | 22081 |
| generateVisionDirections | 78 | 0 | 7681 | 10959 |
| rephraseLight | 4 | 0 | 6017 | 7511 |
| observePattern | 4 | 0 | 11888 | 20933 |
| generateJobTrendCards | 4 | 0 | 6114 | 8269 |

All four failures were on 13 August: three `reflectShort`, one `writeCoverHeadline`.

## Part 2: 28 October, 08:00–08:40 KST

### AI calls

49 rows, all from one anonymous user (`anon-d9b4f972-…`), between 08:05:52 and 08:21:45 KST.

- `reflectShort`: 17 calls, **9 failed** (`calls = 0`). All nine failures were before 08:14:20. From 08:15:12 on, all eight succeeded.
- Every other task succeeded.

| at_kst | task | calls | ms |
|---|---|---|---|
| 08:05:52.1430520 | reflectShort | 0 | 0 |
| 08:05:56.3492529 | judgeBranch | 1 | 4218 |
| 08:06:06.5584706 | reflectShort | 0 | 0 |
| 08:06:10.0369437 | judgeBranch | 1 | 3485 |
| 08:06:28.9792909 | reflectShort | 0 | 0 |
| 08:06:31.8544336 | judgeBranch | 1 | 2881 |
| 08:06:42.5139097 | reflectShort | 0 | 0 |
| 08:06:47.1886131 | judgeBranch | 1 | 4680 |
| 08:07:06.1659090 | reflectPoetic | 1 | 11283 |
| 08:07:30.5566763 | reflectShort | 0 | 0 |
| 08:07:35.1367850 | judgeBranch | 1 | 4587 |
| 08:07:55.2343058 | reflectShort | 1 | 10512 |
| 08:09:34.7864273 | reflectValues | 1 | 6620 |
| 08:12:28.1427639 | synthesizeStrength | 4 | 6984 |
| 08:13:19.4216591 | reflectShort | 0 | 0 |
| 08:13:23.3115610 | judgeBranch | 1 | 3895 |
| 08:13:32.9309819 | reflectShort | 0 | 1 |
| 08:13:36.2793711 | judgeBranch | 1 | 3354 |
| 08:14:05.5950589 | reflectShort | 0 | 1 |
| 08:14:09.9696928 | judgeBranch | 1 | 4375 |
| 08:14:19.5805614 | reflectShort | 0 | 0 |
| 08:14:26.2696873 | judgeBranch | 1 | 6693 |
| 08:15:03.3777436 | judgeBranch | 1 | 3236 |
| 08:15:12.2294593 | reflectShort | 1 | 12080 |
| 08:15:40.7923289 | judgeBranch | 1 | 2993 |
| 08:15:45.6336594 | reflectShort | 1 | 7833 |
| 08:15:59.4476893 | judgeBranch | 1 | 2920 |
| 08:16:06.3426683 | reflectShort | 1 | 9807 |
| 08:17:50.8553426 | judgeBranch | 1 | 3091 |
| 08:17:57.2880183 | reflectShort | 1 | 9502 |
| 08:18:09.6761857 | judgeBranch | 1 | 3268 |
| 08:18:13.5894821 | reflectShort | 1 | 7177 |
| 08:18:24.8051110 | synthesizeGrowthVision | 4 | 7188 |
| 08:18:28.1931760 | generateVisionDirections | 1 | 10564 |
| 08:20:03.7800013 | judgeBranch | 1 | 3106 |
| 08:20:07.4690971 | reflectShort | 1 | 6774 |
| 08:21:25.8327283 | judgeBranch | 1 | 4183 |
| 08:21:29.1185372 | reflectShort | 1 | 7448 |
| 08:21:37.5186150 | writeCoverHeadline | 1 | 1449 |
| 08:21:38.7391208 | writeChapterArticle | 1 | 2619 |
| 08:21:40.0897173 | writeChapterArticle | 1 | 3968 |
| 08:21:40.1549853 | writeEditorNote | 1 | 4071 |
| 08:21:40.2364722 | writeChapterArticle | 1 | 4106 |
| 08:21:40.5584309 | writeEditorNote | 1 | 4478 |
| 08:21:40.8274288 | writeChapterArticle | 1 | 4698 |
| 08:21:43.6959602 | writeCoverHeadline | 1 | 1361 |
| 08:21:44.5064481 | writeChapterArticle | 1 | 2158 |
| 08:21:44.6979178 | writeEditorNote | 1 | 2368 |
| 08:21:45.7168162 | writeEditorNote | 1 | 3375 |

### nginx log

- **Server clock:** `date` printed `2026. 11. 16. (월) 13:31:49 KST`. The server runs on KST.
- **Logs rotated away:** `/var/log/nginx/` holds `access.log` plus daily files from `access.log-20261107.gz` to `access.log-20261116`. Nothing covers 28 October.
- **Log setup:** `nginx.conf` has `access_log /var/log/nginx/access.log main;`. The live `/etc/nginx/conf.d/lg-book.conf` has `access_log off;` on ten lines (7, 16, 28, 36, 51, 91, 100, 112, 120, 135), so most site requests are not logged at all.
- **The guide's `zgrep` commands cannot work as written.** `sudo zgrep -hE "…" /var/log/nginx/access.log* | wc -l` printed `0` with `gzip: /var/log/nginx/access.log*.gz: No such file or directory`. The shell expands `*` as user `potenlab`, who cannot list that folder, so the pattern is passed through unexpanded. The command would print 0 even if the logs existed. The second and third searches were skipped for this reason.

---

## Part 3: redeploy

| Step | Result |
|---|---|
| 3a upload | `lg_magazine-images-20261116-105035-app.tar.gz`, 168,590,847 bytes. FileZilla: "File transfer successful". |
| 3b fingerprint | `65010c49de8bf994215a5af1bbd61e76857804932cec532d6b6dca0756c5b334` — matches. The same hash was computed on the Mac before upload. |
| 3b undo build | `lg_magazine-images-20261110-141158-app.tar.gz` is still in `/home/potenlab` (168,574,463 bytes). |
| 3c | User said "Yes, redeploy now". |
| 3d | `sudo ./redeploy.sh` ended with "Redeploy complete ✓" at about 13:56 KST. |
| 3e image time | `2026-11-16T10:49:46.684623789+07:00` — matches. |
| 3e containers | `lg-magazine-1`, `-2`, `-3`: Up 22–23 seconds (healthy). `mssql-1`: Up 4 months (healthy). |
| 3e filter check | Two files: `/app/.next/static/chunks/0.mwitt3b-16r.js` and `/app/.next/static/chunks/11zl9wa3k0r01.js`. |
| 3f timeout count | `0`. |

What `redeploy.sh` printed, in order: loaded the 16 November bundle, recreated the three app copies (mssql left running), applied five schema files (`cohort_rules`, `llm_usage`, `qrius_logins`, `v3_sessions`, `v3_sessions_userid`), extracted static assets to `/var/www/lg_magazine_public` (107M), reloaded nginx (`syntax is ok`, `test is successful`).

Caveats:

- The container status comes from the table `redeploy.sh` printed. `sudo docker compose ps` was not run separately.
- The 3f timeout count was run without the user's Chapter 1 test. It only shows that nothing timed out in the 15 minutes after the redeploy.

To undo, follow "To undo Part 3" in the guide. The 10 November bundle is in place for it.

## Part 4: HTTP/2

### 4a: what `sudo grep -rn "listen.*443" /etc/nginx/` showed

16 lines, most of them from backup files, which the guide did not expect.

| File | Line | Loaded by nginx? |
|---|---|---|
| `conf.d/lg-book.conf:63` | `listen 443 ssl;` | Yes — the only live line without `http2` |
| `nginx.conf:69`, `:70` | `listen 443 ssl http2;`, `listen [::]:443 ssl http2;` | No, commented out |
| `conf.d/lg-book.conf.bak-20260522153818`, `.bak-static-20260522154333`, `.bak-direct-static`, `.bak-nostore-20260522155425`, `.bak-20260522-http2` | `listen 443 ssl http2;` | No, backups |
| `conf.d/lg-book.conf.bak-replica-20260523-191228`, `.bak-cdn-20260526193927`, `.bak-http-static-20260526231416`, `.bak-ratelimit-20260715202709` | `listen 443 ssl;` | No, backups |
| `nginx.conf.default`, `nginx.conf.bak-replica-20260523-191228`, `nginx.conf.bak-cdn-20260526194008` | commented `listen` lines | No |

**HTTP/2 had been on before.** The backups up to 22 May have `http2`; from the 23 May replica change on it is gone. The reason it was removed is not known. The user was told and chose to turn it on in `lg-book.conf` only.

### 4b–4c: the change

Only `/etc/nginx/conf.d/lg-book.conf` was changed.

| Step | Result |
|---|---|
| Backup | `/root/lg-book.conf.bak-20261116` |
| Before | `63: listen 443 ssl;` |
| After | `63: listen 443 ssl http2;` (the only 443 line in the file) |
| `sudo nginx -t` | `syntax is ok`, `test is successful` |
| `sudo systemctl reload nginx` | returned with no output, at about 14:00 KST |
| Sticky check | `/etc/nginx/conf.d/lg-magazine-upstream.conf:5: hash $cookie_qrius_session consistent;` |

### Check from outside

Run from the Mac, right after the reload:

```
curl -sI --http2 -m 15 https://mybook.lgacademy.com/ -o /dev/null -w 'http_version=%{http_version} status=%{http_code} time=%{time_total}\n'
http_version=2 status=307 time=0.484490
```

The site answers over HTTP/2, so LG's security device is not forcing HTTP/1.1. This is one request; it does not measure whether the 1–3 s connection stalls are gone.

To undo:

```
sudo cp /root/lg-book.conf.bak-20261116 /etc/nginx/conf.d/lg-book.conf
sudo nginx -t
sudo systemctl reload nginx
```

---

## Still to do

1. **3f browser test.** Open mybook.lgacademy.com in a fresh tab, log in, answer the first question of Chapter 1. The editor's reply should appear in a few seconds, in clean Korean.
2. **Measure the effect of HTTP/2** on the connection stalls in Korean working hours.
3. **Find out why HTTP/2 was removed on 23 May**, in case the same problem comes back with three replicas and the sticky cookie.
4. **Fix the `zgrep` commands in the guide** if nginx logs are needed again (the wildcard has to expand under sudo, for example with `sudo sh -c '…'`). Note also that `lg-book.conf` turns the access log off for most locations.

## Notes for the next agent using computer use on this virtual PC

- **Typing does not work.** Text sent with a normal `type` action arrives as a row of the letter "a". Single key presses work for letters and most symbols, but `/`, `=` and `.` were dropped in the terminal.
- **Pasting works**, with one condition. Put the command on the Mac clipboard (`pbcopy`), then switch the Mac's focus to another app and back to DSMacLinker; the clipboard is only sent to Windows on that focus change. Then right-click in the HIWARE terminal to paste. Read the pasted line on screen before pressing Enter.
- **Check the clipboard each time.** Once during the session another program on the Mac replaced the clipboard between copy and paste.
- **Files can be pasted too.** Put a file on the Mac clipboard as a file reference, then use Paste in Windows File Explorer. 168 MB took about 5 minutes. FileZilla's local side is `D:\`.
- **Window capture:** the virtual PC window belongs to a helper process (`sdl3-freerdp`), not to DSMacLinker itself. Background per-app tools only see an empty launcher window; full-screen control is needed.
- **sudo** asks for the password again after roughly 15 minutes without a sudo command. Only the user may type it.
- **HIWARE** asks for the `potenlab` account password when the LGAPOTENLAB terminal is opened. Only the user may type it.

## Left behind

- A copy of the 16 November bundle in the virtual PC's `D:\`.
- A minimized File Explorer window in the virtual PC.
- In the terminal history: `date` twice, and one line of test symbols that was cancelled with Ctrl+C and never run.
