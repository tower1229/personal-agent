-- Add telegram_chat_id and telegram_message_id to long_tasks table

ALTER TABLE long_tasks ADD COLUMN telegram_chat_id INTEGER;
ALTER TABLE long_tasks ADD COLUMN telegram_message_id INTEGER;
