-- Rename nexus_payment_id column to xagent_payment_id
ALTER TABLE payments RENAME COLUMN nexus_payment_id TO xagent_payment_id;
ALTER TABLE payment_events RENAME COLUMN nexus_payment_id TO xagent_payment_id;
ALTER TABLE webhook_delivery_logs RENAME COLUMN nexus_payment_id TO xagent_payment_id;

-- Rename database (run manually as superuser):
-- ALTER DATABASE nexuspay RENAME TO xagentpay;
-- ALTER USER nexuspay RENAME TO xagentpay;
