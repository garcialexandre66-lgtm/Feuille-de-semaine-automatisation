CREATE TABLE IF NOT EXISTS push_keys (
 id INTEGER PRIMARY KEY CHECK (id=1), public_key TEXT NOT NULL, private_key TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
 id TEXT PRIMARY KEY, subscription TEXT NOT NULL, reminder_time TEXT NOT NULL DEFAULT '18:00', created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS push_reminder_runs (
 subscription_id TEXT NOT NULL, week TEXT NOT NULL, stage INTEGER NOT NULL,
 status TEXT NOT NULL, sent_at INTEGER NOT NULL,
 PRIMARY KEY(subscription_id,week,stage)
);
