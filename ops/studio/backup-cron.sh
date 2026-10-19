#!/bin/bash -l
# The Studio Server's daily backup on Clever Cloud (4.2.3, H9), run by clevercloud/cron.json at 03:17 UTC.
# Clever installs the crons of a repository on every app and every instance deployed from it: this one does nothing
# unless the app opts in (STUDIO_BACKUP_CRON=1, the studio app only, never the worker) and only on instance 0. During
# an overlapping redeploy two instances may both be 0 for a moment: a second backup is harmless (another key, or the
# same one written again). The login shell (-l) gives the app's variables: STUDIO_CONFIG_JSON and the add-ons'.
set -euo pipefail
[[ "${STUDIO_BACKUP_CRON:-}" == "1" ]] || exit 0
# Instance 0 only, and only when Clever says which one this is: a missing number backs nothing up rather than every
# instance (two backups a day would halve what --keep keeps).
[[ "${INSTANCE_NUMBER:-}" == "0" ]] || exit 0
cd "${APP_HOME:-$ROOT}"
exec npm run -s studio-server -- backup --to-bucket --keep "${STUDIO_BACKUP_KEEP:-14}"
