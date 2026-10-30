CREATE TABLE IF NOT EXISTS delivery_settings (
 id INTEGER PRIMARY KEY CHECK (id=1),
 to_address TEXT NOT NULL DEFAULT '',
 copy_address TEXT NOT NULL DEFAULT '',
 send_time TEXT NOT NULL DEFAULT '17:00',
 enabled INTEGER NOT NULL DEFAULT 0,
 refresh_token TEXT,
 connected_email TEXT
);
INSERT OR IGNORE INTO delivery_settings(id) VALUES(1);
CREATE TABLE IF NOT EXISTS google_states (state TEXT PRIMARY KEY, session_hash TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS delivery_runs (
 week TEXT PRIMARY KEY, signature TEXT NOT NULL, status TEXT NOT NULL,
 message TEXT NOT NULL, drive_id TEXT, gmail_id TEXT, updated INTEGER NOT NULL
);
