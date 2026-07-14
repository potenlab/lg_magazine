# Outbound SSH Inquiry — Finding & Response

**Context:** LG CNS (길상욱 책임) reported the LG server (`203.247.146.226`) makes
outbound SSH connections. Per security policy, **outbound will be blocked before
service open.** This documents what we checked, what we found, and the reply.

---

## 1. What we checked (on the prod VM, 2026-06-08)

```
sudo ss -tnp | grep ':22'
sudo lsof -nP -i TCP:22 | grep -i ESTAB
sudo crontab -l ; ls -la /etc/cron.d/
```

> ⚠️ The server runs **HIWARE** command filtering. Inline comments / the literal
> string `ssh` in a command can be flagged ("Prohibited input count"). Run plain
> commands, no comments. 3 flags after a warning blocks the session.

## 2. Finding

- The only SSH connection present was **inbound**:
  `203.247.146.226:22 ← 165.243.168.201` , process **`sshd`** (the SSH *server*).
  That is the **admin login session itself**, not outbound traffic.
- **Outbound** SSH would be `203.247.146.226:<random> → <host>:22` with process
  **`ssh`** (the client). **None was present** at check time.
- `no crontab for root`; `/etc/cron.d/` holds only the stock `0hourly`. **No
  scheduled job initiates SSH.**
- Our application and deploy pipeline do **not** use outbound SSH: git remote is
  **HTTPS** (`https://github.com/...`), no `git+ssh` npm deps, no submodules, no
  tunnels (cloudflared/autossh) in our scripts.

**Conclusion:** No outbound SSH was active during the check. If LG observes it
recurring, it is **intermittent** and almost certainly **manual developer/admin
access** (someone SSH-ing out, or git-over-SSH, *from* the box) — not the service.

## 3. Impact of blocking outbound SSH (port 22)

**None on the service.** Production only needs **outbound HTTPS (443)**:
- AI Studio API calls → HTTPS
- Code deploy (`git pull`) → HTTPS
- Database → local container (no network egress)

> **Must confirm with LG:** the block is **SSH (22) only** and **outbound HTTPS
> (443) stays open.** If all outbound is blocked, AI calls and git deploys break.

## 4. To catch the intermittent outbound SSH

Run periodically over a day (plain command, HIWARE-safe):
```
sudo ss -tnp state established dport = :22
```
- Empty → no outbound SSH at that moment.
- A line → shows destination IP + process = the culprit.

Also: `sudo grep ssh /var/log/secure`

Fastest path: **ask LG for the timestamps + destination IPs** they logged, then
correlate with who was active.

## 5. Next steps

1. Reply to LG (below): agree to the block, confirm no service impact, ask for
   their log details + confirm 443 stays open.
2. Spot-check `dport = :22` across the day to catch the source.
3. Tell the dev team: **do not SSH out / use git-over-SSH from the prod box.**
   Use HTTPS for git; do remote work without chaining SSH off the server.
4. Re-verify after the policy block that the service (AI calls + deploy) is fine.

---

## 6. Draft reply to 길상욱 책임

### English

> Hello 길상욱 책임님,
>
> Apologies for the late reply. Here is what we found on the server regarding the
> outbound SSH question.
>
> **1) No service impact / we agree to the block**
> Our service application and deployment process do not use outbound SSH (port 22).
> Code deployment is over HTTPS (github.com, 443), AI calls go to the AI Studio API
> over HTTPS (443), and the database is an internal container on the server.
> Therefore, **blocking outbound SSH has no impact on the service, and we agree to
> the block per your security policy.**
>
> **2) Current check results**
> At the time of our check, no outbound SSH connections were present (the only active
> connection was the administrator's own login session), and there were no cron jobs
> initiating outbound SSH. Any intermittently detected outbound SSH is presumed to be
> manual operator/developer access, which we will identify and stop.
>
> **3) Requests**
> - To pinpoint the cause, please share the **timestamps and destination IPs** of the
>   outbound SSH you observed.
> - Please confirm the scope of the block — will **only outbound SSH (port 22)** be
>   blocked while **outbound HTTPS (443) remains open**? (443 is required for AI Studio
>   calls and code deployment.)
>
> Thank you.

### Korean (한국어)

> 안녕하세요, 길상욱 책임님.
>
> 회신이 늦어 죄송합니다. outbound SSH 관련 서버에서 확인한 결과 공유드립니다.
>
> **1) 서비스 영향 없음 / 차단 동의**
> 저희 서비스 애플리케이션과 배포 과정은 외부로 SSH(22번 포트)를 사용하지 않습니다.
> 코드 배포는 HTTPS(github.com, 443), AI 호출은 AI Studio API(HTTPS, 443)로 이루어지며,
> DB는 서버 내부 컨테이너입니다. 따라서 **outbound SSH 차단은 서비스 운영에 영향이 없으며,
> 보안 정책에 따른 차단에 동의합니다.**
>
> **2) 현재 점검 결과**
> 서버 점검 시점에는 외부로 나가는 SSH 연결이 확인되지 않았고(현재 연결은 관리자 접속 세션뿐),
> 외부 SSH를 발생시키는 cron 작업도 없었습니다. 간헐적으로 감지되는 outbound SSH는
> 운영/개발자의 수동 접속으로 추정되며, 저희가 원인을 식별하여 중단 조치하겠습니다.
>
> **3) 요청 사항**
> - 정확한 식별을 위해, 관측하신 **outbound SSH의 발생 시각과 목적지 IP 로그**를 공유해 주시면
>   빠르게 특정하겠습니다.
> - 차단 범위 확인 부탁드립니다 — **outbound SSH(22번)만 차단**되고 **outbound HTTPS(443)는
>   유지**되는지요? (AI Studio 호출 및 코드 배포에 443이 필요합니다.)
>
> 감사합니다.
