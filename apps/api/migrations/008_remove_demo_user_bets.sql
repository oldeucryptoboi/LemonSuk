DELETE FROM notification_email_deliveries
WHERE notification_id IN (
  SELECT id
  FROM notifications
  WHERE user_id = 'demo-user'
);

DELETE FROM notifications
WHERE user_id = 'demo-user';

DELETE FROM bets
WHERE user_id = 'demo-user';
