# LG OWL: mint the 600 load-test logins on the server (computer use guide)

Paste this into a Claude desktop chat with Computer use turned on:

> Read this guide and follow it: `https://raw.githubusercontent.com/potenlab/lg_magazine/production/docs/computer_use_loadtest_cookies_20261117.md`. Use computer use on the "TILON MAC Linker" window.

---

## The job

On the production server of the LG OWL magazine (mybook.lgacademy.com), make 600 signed test logins (`cookies.json`) so Claude Code can run the 600-user load test from the Mac. The server's secret never leaves the server and is never printed.

| Part | What | Changes the live server? |
|---|---|---|
| 1 | Upload the mint script (the user does this) | No |
| 2 | Make the 600 logins inside the app container | No (read-only; nothing is deployed) |
| 3 | Download `cookies.json` to the Mac (the user does this) | No |
| 4 | Delete the temporary files on the server | No |

Do them in order. If any step fails or looks different from this guide, **stop and report**; don't improvise a fix.

**This guide does not deploy anything, change nginx, or touch the database.** It only runs one small script inside the already-running app container and reads the result. The 600 logins are ordinary signed session cookies, valid 6 hours, exactly like a real participant's.

**This guide does not run the load test and does not turn off the stub login.** Those are separate. The load test is run by Claude Code from the Mac after `cookies.json` arrives. Turning off the stub login is a different guide (it restarts the app); do not combine them.

## Where things are

- On this Mac, the window **"TILON MAC Linker"** (app: DSMacLinker) shows LG's Windows virtual PC. Request computer use access to **DSMacLinker** only.
- Inside the virtual PC:
  - The **HIWARE terminal** window titled **"LGAPOTENLAB"** is a shell on the production server, as user `potenlab`.
  - **FileZilla** moves files between the server's `/home/potenlab` and the Mac (the user does the file moves).
- It's a remote screen, so the text is small; take a fresh screenshot before each click or typed command.

## Rules for the whole job

1. Only touch what this guide names.
2. Never type a password, and never sign in anywhere. When `sudo` asks for a password, **stop and ask the user to type it**.
3. **Don't click the dark U-Cloud side panel** on the right (Cloud Disk, Recovery Manager, Desktop Setting, Close). Those can reset or close the virtual PC.
4. Ignore macOS pop-ups on the Mac itself.
5. If anything looks different from this guide (an unexpected dialog, an error, a number that doesn't match), stop and ask the user.
6. **`cookies.json` is sensitive — it holds live session logins.** Never paste its contents into the chat, Slack, Drive or git. Only its size and the one-line status are copied into the chat.

### HIWARE terminal rules (strict, the session gets blocked otherwise)

- Never type the `#` character, and never type the three-letter name of the remote-login tool (s, s, h), not even inside a search. Three flagged commands block the session.
- Type **one command at a time, exactly as written** in the boxes below. Each box is one command. Wait for it to finish and read the output before the next one.
- Copy every output into the chat as you go (except the cookies themselves). The user passes your report to Claude Code.

---

## Part 1: upload the mint script (the user does this)

Ask the user to upload **`mint-cookies-server.js`** from `~/Desktop/lg-loadtest-20261117/` on the Mac to `/home/potenlab` on the server with FileZilla, the same way they upload a bundle. Wait until they say it's done.

Check it arrived and is small (about 1.3 KB of plain JavaScript):
```
ls -la ~/mint-cookies-server.js
```
If it's missing, ask the user to upload it again before going on.

## Part 2: make the 600 logins (read-only)

This runs the script **inside the running app container**, where the server's settings live. The script reads the secret from the container's own environment, writes only the signed logins to `~/cookies.json`, and prints a one-line status. The secret is never shown.

```
cd ~/lg_magazine
```
```
sudo docker compose exec -T lg-magazine node - < ~/mint-cookies-server.js > ~/cookies.json
```
It should print one line to the screen:
`OK: minted 600 cookies, valid until <date ~6 hours from now>` — copy that line into the chat.
If it instead prints `STOP: QRIUS_SESSION_SECRET is not set in this container`, stop and report it; the container has no secret and the rest can't proceed.

Check the file is the expected size:
```
wc -c ~/cookies.json
```
It must print **`69001`** (give or take a few bytes only if the status line said a count other than 600). If it is far smaller — a few hundred bytes — the file holds an error message, not logins: open it with `head -c 200 ~/cookies.json`, copy that into the chat, and stop.

Lock the file down:
```
chmod 600 ~/cookies.json
```

> The logins are valid for **6 hours**, so make them on the day of the test. For a longer life, add `-e MINT_HOURS=12` right after `-T` in the Part 2 command (so: `... exec -T -e MINT_HOURS=12 lg-magazine node - < ...`).

## Part 3: download to the Mac (the user does this)

Ask the user to download `/home/potenlab/cookies.json` with FileZilla and save it on the Mac at exactly:
```
~/lg-loadtest-20261117/cookies.json
```
Wait until they confirm. Remind them not to put the file in Slack, Drive or git.

> If FileZilla can't bring a file **from** the server back to the Mac, stop and tell the user to use the other path instead: on the server run `sudo grep QRIUS_SESSION_SECRET ~/lg_magazine/.env`, type the value by hand into `~/.lgmag-qrius-secret` on the Mac, and tell Claude Code — the secret must not go into the chat.

## Part 4: clean up the server

Once the user confirms the Mac has the file:
```
rm ~/cookies.json ~/mint-cookies-server.js
```
```
ls -la ~/cookies.json
```
Should print `No such file or directory` — confirming the sensitive file is gone from the server.

---

## Final report to the user

1. Part 1: the mint script was present on the server (yes / no).
2. Part 2: the exact `OK:` / `STOP:` status line, and the `wc -c` number.
3. Part 3: the user confirmed `cookies.json` is on the Mac at `~/lg-loadtest-20261117/cookies.json` (yes / no), or that FileZilla couldn't copy it back.
4. Part 4: the server file is deleted (yes / no).
5. Anything that looked wrong, and any step you skipped and why.

The user passes this to Claude Code. Claude Code then runs `~/lg-loadtest-20261117/run-with-cookies.sh --check` (one request, no AI call) to confirm the server accepts a login, and — only at a time LG approved and with the cost accepted — starts the test.
