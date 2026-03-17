CREATE TABLE IF NOT EXISTS notification_email_deliveries (
  notification_id TEXT PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  delivered_at TIMESTAMPTZ NOT NULL,
  provider TEXT NOT NULL
);
