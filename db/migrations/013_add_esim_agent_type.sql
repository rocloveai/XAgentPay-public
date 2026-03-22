-- 013_add_esim_agent_type.sql
-- Allow 'esim' as a valid agent_type in the orders table.
-- Without this, all eSIM orders fail with a CHECK constraint violation.

-- Drop the old constraint and recreate with 'esim' included
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_agent_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_agent_type_check
  CHECK (agent_type IN ('flight', 'hotel', 'esim'));
