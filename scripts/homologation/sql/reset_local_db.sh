#!/usr/bin/env bash
# Rebuild the LOCAL homologation database from zero (never touches remote).
set -euo pipefail
PGBIN=/tmp/pgsrv/bin
export PGHOST=/tmp/pg PGPORT=55432 PGUSER=postgres
$PGBIN/psql -q -d postgres -c "DROP DATABASE IF EXISTS homolog WITH (FORCE);" -c "CREATE DATABASE homolog;"
$PGBIN/psql -q -d postgres -c 'ALTER ROLE postgres IN DATABASE homolog SET search_path = "$user", public, extensions;'
$PGBIN/psql -q -d postgres -c 'ALTER DATABASE homolog SET search_path = "$user", public, extensions;'
$PGBIN/psql -q -d homolog -v ON_ERROR_STOP=1 -f /tmp/pg/bootstrap.sql
n=0
for f in /dev-server/supabase/migrations/*.sql; do
  v=$(basename "$f" | cut -d_ -f1)
  if ! out=$($PGBIN/psql -q -d homolog -v ON_ERROR_STOP=1 -f "$f" 2>&1); then
    echo "MIGRATION FAILURE after $n: $f"; echo "$out" | grep -m5 ERROR; exit 1
  fi
  $PGBIN/psql -q -d homolog -c "insert into supabase_migrations.schema_migrations(version,name) values ('$v','$(basename "$f")') on conflict do nothing;"
  n=$((n+1))
done
echo "MIGRATIONS APPLIED: $n"
