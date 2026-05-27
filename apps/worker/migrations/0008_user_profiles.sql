CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  name TEXT,
  birthday_timestamp INTEGER,
  gender TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
