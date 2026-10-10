#!/bin/bash
# Optional partial admin export; this is not a full database backup.
#
#   BULLBEAR_HOST=https://bullandbear.az bash scripts/backup-db.sh
#
# Writes a timestamped file per run, so it never overwrites an earlier backup,
# and never deletes one. Pruning is left to a human on purpose: this keeps prior exports available; a self-pruning job could delete
# a copy you needed.
#
# LIMIT: it pulls /api/admin/platform over HTTP,
# and that route maps users through publicUser(), which omits passwordHash.
# This export omits login credentials; it is not a restore-ready database copy. The complete file lives on
# the Render disk at /data/data/db.json and can only be copied through the
# Render shell or a disk snapshot. See docs/BACKUPS.md.
#
# The route also caps payments, paymentLogs, auditLogs and announcements at 100
# records each. This script warns when a collection reaches that line.
#
# The admin password is read from the macOS Keychain, never stored here or in
# the launchd job. Create the entry once with:
#
#   security add-generic-password -a bullbear-admin -s bullbear-admin-password -w
#
set -uo pipefail

HOST="${BULLBEAR_HOST:?Set BULLBEAR_HOST to the exact Bull & Bear host to export}"
BACKUP_DIR="${BULLBEAR_BACKUP_DIR:-$HOME/Projects/bullbear-backups}"
ADMIN_USER="${BULLBEAR_ADMIN_USER:-admin}"
KEYCHAIN_SERVICE="${BULLBEAR_KEYCHAIN_SERVICE:-bullbear-admin-password}"
KEYCHAIN_ACCOUNT="${BULLBEAR_KEYCHAIN_ACCOUNT:-bullbear-admin}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/admin-export-$TS.json"
LOG="$BACKUP_DIR/admin-export.log"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null

say() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" | tee -a "$LOG"; }
die() { say "FAILED: $1"; exit 1; }

PASSWORD="$(security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w 2>/dev/null)" \
  || die "no Keychain entry '$KEYCHAIN_SERVICE' for account '$KEYCHAIN_ACCOUNT' (see the header of this script)"
[ -n "$PASSWORD" ] || die "Keychain entry '$KEYCHAIN_SERVICE' is empty"

BODY="$(ADMIN_USER="$ADMIN_USER" PASSWORD="$PASSWORD" python3 -c '
import json, os
print(json.dumps({"identifier": os.environ["ADMIN_USER"], "password": os.environ["PASSWORD"]}))')"

TOKEN="$(curl -sS --max-time 30 -X POST "$HOST/api/auth/login" \
  -H 'Content-Type: application/json' --data-binary "$BODY" \
  | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("token",""))
except Exception: print("")')"
unset PASSWORD BODY

[ -n "$TOKEN" ] || die "admin login rejected by $HOST"

TMP="$(mktemp)"
curl -sS --max-time 60 "$HOST/api/admin/platform" -H "Authorization: Bearer $TOKEN" -o "$TMP" \
  || { rm -f "$TMP"; die "could not reach $HOST/api/admin/platform"; }

# Only publish the file once it is known to be good, so a truncated download
# never lands in the backup directory looking like a usable backup.
python3 - "$TMP" <<'PY' || { rm -f "$TMP"; exit 1; }
import json, sys
with open(sys.argv[1]) as fh:
    data = json.load(fh)          # raises, and fails the run, if truncated
for key in ("users", "payments", "auditLogs"):
    if key not in data:
        raise SystemExit(f"response is missing '{key}' - not a valid platform payload")
PY

mv "$TMP" "$OUT"
chmod 600 "$OUT"
shasum -a 256 "$OUT" | awk '{print $1}' > "$OUT.sha256"

say "wrote $(basename "$OUT") ($(wc -c < "$OUT" | tr -d ' ') bytes)"
OUT="$OUT" python3 <<'PY' | tee -a "$LOG"
import json, os
with open(os.environ["OUT"]) as fh:
    data = json.load(fh)
CAPPED = ("payments", "paymentLogs", "auditLogs", "announcements")
for key in ("users", "subscriptions", "payments", "paymentLogs", "auditLogs", "announcements"):
    value = data.get(key)
    count = len(value) if isinstance(value, list) else 0
    flag = "  <-- at the 100-record API cap, likely truncated" if key in CAPPED and count >= 100 else ""
    print(f"    {key:14} {count}{flag}")
PY
say "ok"
