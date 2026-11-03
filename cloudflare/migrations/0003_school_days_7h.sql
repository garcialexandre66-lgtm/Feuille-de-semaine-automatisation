-- Materialize dates already stored in the private account's school planning.
-- No personal dates are embedded in the migration. Existing entries are preserved.
UPDATE account AS target
SET payload = (
  WITH RECURSIVE
  planned AS (
    SELECT ROW_NUMBER() OVER (ORDER BY entry.key) AS position,
           date(entry.key, '-' || ((CAST(strftime('%w', entry.key) AS INTEGER) + 6) % 7) || ' days') AS week,
           ((CAST(strftime('%w', entry.key) AS INTEGER) + 6) % 7) AS day_index
    FROM json_each(target.payload, '$.schoolDates') AS entry
    WHERE entry.type = 'true'
      AND entry.key GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND date(entry.key) = entry.key
  ),
  filled(position, document) AS (
    SELECT 0, target.payload
    UNION ALL
    SELECT filled.position + 1,
      CASE
        WHEN COALESCE(json_array_length(filled.document, '$.weeks."' || planned.week || '"[' || planned.day_index || ']'), 0) > 0
          THEN filled.document
        ELSE json_set(
          CASE WHEN json_type(filled.document, '$.weeks."' || planned.week || '"') IS NULL
            THEN json_set(filled.document, '$.weeks."' || planned.week || '"', json('[[],[],[],[],[],[],[]]'))
            ELSE filled.document
          END,
          '$.weeks."' || planned.week || '"[' || planned.day_index || ']',
          json('[{"client":"École","city":"","workplace":"school","travel":0,"tpe":420,"regie":0,"chantier":0,"sav":0,"prep":"","intervention":""}]')
        )
      END
    FROM filled JOIN planned ON planned.position = filled.position + 1
  )
  SELECT document FROM filled ORDER BY position DESC LIMIT 1
),
revision = revision + 1
WHERE EXISTS (SELECT 1 FROM json_each(target.payload, '$.schoolDates') WHERE type = 'true');
