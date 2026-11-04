set -u

section() { printf '\n===== %s =====\n' "$1"; }

APP_IDS=$(docker ps -q --filter label=com.docker.compose.service=lg-magazine)
DB_ID=$(docker ps -q --filter label=com.docker.compose.service=mssql | head -1)
FIRST_APP=$(printf '%s\n' "$APP_IDS" | head -1)
DB_NAME=$(docker exec "$FIRST_APP" printenv MSSQL_DATABASE 2>/dev/null || true)
DB_NAME=${DB_NAME:-lg_magazine}
ACCESS_LOG=/var/log/nginx/access.log
ERROR_LOG=/var/log/nginx/error.log

q() {
  docker exec "$DB_ID" sh -c '/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -No -d "$2" -W -s "|" -Q "$1"' _ "$1" "$DB_NAME"
}

section "host"
date
uptime
nproc
free -m
df -h / /var/lib/docker /var/www 2>/dev/null
vmstat 1 5

section "tcp connection drops on the VM, sampled 60s apart"
TCP_COUNTERS="TcpExtListenOverflows TcpExtListenDrops TcpExtTCPReqQFullDrop TcpExtTCPBacklogDrop TcpRetransSegs"
nstat -azs $TCP_COUNTERS
sleep 60
nstat -azs $TCP_COUNTERS
ss -ltn 'sport = :443'
ss -s
sysctl net.core.somaxconn net.ipv4.tcp_max_syn_backlog net.ipv4.tcp_syncookies net.ipv4.tcp_timestamps net.ipv4.tcp_tw_recycle net.ipv4.tcp_tw_reuse 2>/dev/null
printf 'conntrack count/max: '
cat /proc/sys/net/netfilter/nf_conntrack_count /proc/sys/net/netfilter/nf_conntrack_max 2>/dev/null | paste -sd/ -
printf 'kernel log conntrack-full or SYN-flood lines: '
dmesg -T 2>/dev/null | grep -ciE 'nf_conntrack: table full|possible SYN flooding'

section "does each new connection attempt reach the VM, 120s, attempts per connection then count"
IFACE=$(ip route show default | awk '{print $5; exit}')
VM_IP=$(ip -4 route get 1.1.1.1 | grep -oE 'src [0-9.]+' | cut -d' ' -f2)
command -v tcpdump >/dev/null || echo 'tcpdump not installed'
timeout 120 tcpdump -nn -l -i "$IFACE" "dst host $VM_IP and tcp dst port 443 and tcp[tcpflags] & (tcp-syn|tcp-ack) == tcp-syn" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+ >' | sort | uniq -c | awk '{print $1}' | sort -n | uniq -c

section "http2 offered by nginx itself, seen from inside the VM"
echo | openssl s_client -connect 127.0.0.1:443 -servername mybook.lgacademy.com -alpn h2 2>/dev/null | grep -E 'ALPN'

section "firewall rules that could act per source or on port 443"
iptables -S 2>/dev/null | grep -E 'dport 443|dports|hashlimit|connlimit|recent'
printf 'fail2ban processes: '
ps -eo comm | grep -c fail2ban

section "containers"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}'
for id in $APP_IDS $DB_ID; do
  docker inspect --format '{{.Name}} started={{.State.StartedAt}} restarts={{.RestartCount}} oom={{.State.OOMKilled}}' "$id"
done

section "docker disk and log size"
docker system df
for id in $APP_IDS $DB_ID; do
  du -h "$(docker inspect --format '{{.LogPath}}' "$id")"
done

section "replica response"
for port in 3002 3003 3004; do
  /usr/bin/curl -s -o /dev/null --max-time 10 -w "port $port: %{http_code} in %{time_total}s\n" "http://127.0.0.1:$port/api/auth/qrius/me"
done

section "nginx config"
nginx -T 2>/dev/null | grep -E '^\s*(listen|http2|hash|least_conn|ip_hash|keepalive|worker_connections|proxy_read_timeout|limit_req|limit_conn)\b'

section "nginx error counts"
for pattern in 'upstream timed out' 'no live upstreams' 'worker_connections are not enough' 'Too many open files' 'connect() failed'; do
  printf '%s: ' "$pattern"
  grep -c "$pattern" "$ERROR_LOG"
done

section "nginx requests by status class today"
TODAY=$(date '+%d/%b/%Y')
grep -F "$TODAY" "$ACCESS_LOG" | awk '{print substr($9,1,1)"xx"}' | sort | uniq -c

section "client addresses nginx sees today, last part hidden"
grep -F "$TODAY" "$ACCESS_LOG" | awk '{print $1}' | sed -E 's/\.[0-9]+$/.x/' | sort | uniq -c | sort -rn | head -5
printf 'distinct clients: '
grep -F "$TODAY" "$ACCESS_LOG" | awk '{print $1}' | sort -u | wc -l

section "nginx busiest minutes today"
grep -F "$TODAY" "$ACCESS_LOG" | awk '{print substr($4,2,17)}' | sort | uniq -c | sort -rn | head -10

section "nginx busiest paths today"
grep -F "$TODAY" "$ACCESS_LOG" | awk '{split($7,p,"?"); print p[1]}' | sort | uniq -c | sort -rn | head -15

section "app log signals last 24h per replica"
for id in $APP_IDS; do
  name=$(docker inspect --format '{{.Name}}' "$id")
  logs=$(docker logs --since 24h "$id" 2>&1)
  printf '%s llm_usage=%s saturated=%s fetch_failed=%s\n' "$name" \
    "$(printf '%s\n' "$logs" | grep -c '"evt":"llm_usage"')" \
    "$(printf '%s\n' "$logs" | grep -c 'queue saturated')" \
    "$(printf '%s\n' "$logs" | grep -c 'fetch failed')"
done

section "llm settings"
docker exec "$FIRST_APP" env | grep -E '^(LLM_ASYNC|LLM_PROVIDER|LLM_QUEUE_CONCURRENCY|AISTUDIO_MAX_CONCURRENCY|AISTUDIO_LIGHT_MAX_CONCURRENCY|AISTUDIO_QUEUE_TIMEOUT_MS)='

section "ai studio reachability from the VM"
AI_BASE=$(docker exec "$FIRST_APP" printenv AISTUDIO_BASE_URL 2>/dev/null || true)
for i in 1 2 3 4 5; do
  /usr/bin/curl -s -o /dev/null --max-time 15 -w "%{http_code} connect=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer} total=%{time_total}\n" "$AI_BASE"
  sleep 1
done

section "mssql table sizes"
q "SELECT t.name AS tbl, SUM(CASE WHEN a.type=1 AND i.index_id IN (0,1) THEN p.rows ELSE 0 END) AS row_count, SUM(a.total_pages)*8/1024 AS size_mb FROM sys.tables t JOIN sys.indexes i ON t.object_id=i.object_id JOIN sys.partitions p ON i.object_id=p.object_id AND i.index_id=p.index_id JOIN sys.allocation_units a ON p.partition_id=a.container_id GROUP BY t.name ORDER BY size_mb DESC"

section "mssql file size against the Express 10 GB cap"
q "SELECT name, type_desc, size*8/1024 AS size_mb FROM sys.database_files"

section "mssql memory"
q "SELECT physical_memory_in_use_kb/1024 AS mem_mb, memory_utilization_percentage AS util_pct FROM sys.dm_os_process_memory"

section "mssql session payload size"
q "SELECT status, COUNT(*) AS sessions, AVG(DATALENGTH(data))/1024 AS avg_kb, MAX(DATALENGTH(data))/1024 AS max_kb FROM dbo.v3_sessions GROUP BY status"

section "mssql most expensive queries since restart"
q "SELECT TOP 8 qs.execution_count AS runs, qs.total_elapsed_time/qs.execution_count/1000 AS avg_ms, qs.max_elapsed_time/1000 AS max_ms, REPLACE(REPLACE(SUBSTRING(st.text,1,70),CHAR(10),' '),CHAR(13),' ') AS query FROM sys.dm_exec_query_stats qs CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st ORDER BY qs.total_elapsed_time DESC"

section "logins per hour KST last 14 days"
q "SELECT TOP 40 CONVERT(varchar(13), DATEADD(hour,9,logged_in_at), 120) AS kst_hour, COUNT(*) AS logins FROM dbo.qrius_logins WHERE logged_in_at > DATEADD(day,-14,SYSUTCDATETIME()) GROUP BY CONVERT(varchar(13), DATEADD(hour,9,logged_in_at), 120) ORDER BY kst_hour DESC"

section "llm latency per hour KST last 14 days"
q "SELECT TOP 60 CONVERT(varchar(13), DATEADD(hour,9,created_at), 120) AS kst_hour, tier, COUNT(*) AS calls, COUNT(DISTINCT session_id) AS sessions, AVG(ms) AS avg_ms, MAX(ms) AS max_ms, SUM(CASE WHEN ms>30000 THEN 1 ELSE 0 END) AS over_30s, SUM(CASE WHEN calls=0 THEN 1 ELSE 0 END) AS no_result FROM dbo.llm_usage WHERE created_at > DATEADD(day,-14,SYSUTCDATETIME()) GROUP BY CONVERT(varchar(13), DATEADD(hour,9,created_at), 120), tier ORDER BY kst_hour DESC, tier"

section "llm latency by task last 24h"
q "SELECT task, tier, COUNT(*) AS calls, AVG(ms) AS avg_ms, MAX(ms) AS max_ms, SUM(CASE WHEN calls=0 THEN 1 ELSE 0 END) AS no_result FROM dbo.llm_usage WHERE created_at > DATEADD(hour,-24,SYSUTCDATETIME()) GROUP BY task, tier ORDER BY avg_ms DESC"

section "done"
date
