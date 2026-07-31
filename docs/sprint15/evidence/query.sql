SELECT
  a.attnum,
  a.attname,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type
FROM pg_type t
JOIN pg_class c
  ON c.oid = t.typrelid
JOIN pg_attribute a
  ON a.attrelid = c.oid
WHERE t.typname = 'entity_action_context'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum;
