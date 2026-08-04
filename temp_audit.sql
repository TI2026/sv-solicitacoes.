SELECT
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.character_maximum_length,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'approval_flow_steps'
ORDER BY c.ordinal_position;

SELECT
  con.conname,
  con.contype,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel
  ON rel.oid = con.conrelid
JOIN pg_namespace n
  ON n.oid = rel.relnamespace
WHERE n.nspname = 'public'
  AND rel.relname = 'approval_flow_steps'
ORDER BY con.conname;

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'approval_flow_steps'
ORDER BY indexname;

SELECT
  a.attname AS column_name,
  col_description(c.oid, a.attnum) AS comment
FROM pg_class c
JOIN pg_namespace n
  ON n.oid = c.relnamespace
JOIN pg_attribute a
  ON a.attrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relname = 'approval_flow_steps'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum;
