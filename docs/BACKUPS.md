# Backups

The whole database is one file on the Render persistent disk:

```
/data/data/db.json
```

`STORAGE_DIR=/data` is the mount; `server.js` joins `data` onto it, which is why
the file sits one level deeper than the mount point. Uploads live beside it at
`/data/uploads/`. Nothing of value is stored in the deploy image — `data/db.json`
is gitignored and never ships, so a deploy replaces the code and leaves the data
alone. That was verified on 9 Oct 2026: a real redeploy ran and every collection
came through unchanged.

Audit logs are not a separate store. They are `db.auditLogs` inside that same
file, so backing up the file backs up the audit history.

## Scheduled recovery snapshots

Render automatically snapshots each attached persistent disk once every 24
hours and keeps snapshots for at least seven days. The database and uploads are
both under the `/data` mount, so a snapshot of the correct disk covers both.
This is the scheduled recovery path; no Mac launchd job needs to be installed.

A restore replaces the entire disk with the selected snapshot. All writes made
after that snapshot are lost, and Render does not restore individual files.
Attaching a disk requires a redeploy, and services with disks do not get
zero-downtime deploys. Keep the correct service and attached disk verified
before applying the blueprint. See [Render's persistent disk documentation](https://render.com/docs/disks).

## Two limits worth knowing

| Limit | Where | Effect |
|---|---|---|
| **500 audit records** | `addAuditLog()` in `server.js` | Entries past the newest 500 are deleted permanently, not archived |
| **100 records per list** | `/api/admin/platform` | Payments, paymentLogs, auditLogs and announcements are truncated at 100 in the HTTP response |

## Optional admin export (not a full backup)

`scripts/backup-db.sh` pulls `/api/admin/platform` over HTTP. That route maps
users through `publicUser()`, which omits `passwordHash`, and caps several
collections at 100 records. It is only a partial admin export and cannot
restore the full database. Do not treat it as the scheduled database backup.
For a separate complete copy, take the file itself (below).

The script writes a timestamped export per run, so it never overwrites an earlier
file, and it never deletes one. Pruning is deliberately left to a human.

## One-time setup

Store the admin password in the Keychain (it is never written into the script or
the launchd job):

```bash
security add-generic-password -a bullbear-admin -s bullbear-admin-password -w
```

Run the optional admin export by hand to confirm it works:

```bash
BULLBEAR_HOST=https://bullandbear.az bash scripts/backup-db.sh
```

## Optional local schedule for admin exports

The launchd template is only for the incomplete admin export above; it is not
needed for Render's automatic disk snapshots. Leave it inactive unless you
explicitly want a daily partial JSON export. If you install it, set the exact
host explicitly; the example below targets the production domain.

```bash
sed -e "s|__REPO__|$PWD|g" \
  -e "s|__BACKUP_DIR__|$HOME/Projects/bullbear-backups|g" \
  -e "s|__BULLBEAR_HOST__|https://bullandbear.az|g" \
  scripts/com.bullbear.backup.plist.template > ~/Library/LaunchAgents/com.bullbear.admin-export.plist
```

```bash
launchctl load ~/Library/LaunchAgents/com.bullbear.admin-export.plist && launchctl list | grep bullbear
```

Confirm it is registered:

```bash
launchctl list com.bullbear.admin-export
```

To stop it: `launchctl unload ~/Library/LaunchAgents/com.bullbear.admin-export.plist`

## Taking a complete copy (including password hashes)

Only the file on disk has everything. In the Render dashboard, open the service
and pick **Shell**, then:

```bash
gzip -c /data/data/db.json | base64
```

Copy that output, and locally:

```bash
pbpaste | base64 -d | gunzip > ~/Projects/bullbear-backups/db-full-$(date -u +%Y%m%dT%H%M%SZ).json
```

The round trip is lossless — a ~30 KB database comes out as roughly 8.6 KB of
base64 on one line.

## Validating a backup

`validate-backup.sh` (kept alongside the backups, outside this repo) restores a
backup into a throwaway directory, boots a server against it, logs in through
the admin route and compares every collection against the file:

```bash
bash ~/Projects/bullbear-backups/validate-backup.sh <backup-file.json>
```

It reports whether password hashes are present, so an incomplete backup is
obvious rather than silently reassuring.
