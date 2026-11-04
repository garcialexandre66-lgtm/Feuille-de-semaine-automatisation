ALTER TABLE delivery_runs ADD COLUMN recipient TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS delivery_previews (
 id TEXT PRIMARY KEY,
 week TEXT NOT NULL,
 signature TEXT NOT NULL,
 details TEXT NOT NULL,
 pdf TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'ready',
 expires INTEGER NOT NULL,
 created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS delivery_previews_expires ON delivery_previews(expires);
