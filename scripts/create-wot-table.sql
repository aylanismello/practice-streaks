CREATE TABLE IF NOT EXISTS wot_log (
  date date PRIMARY KEY,
  color text NOT NULL CHECK (color IN ('green', 'yellow', 'red')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE wot_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY wot_log_read ON wot_log FOR SELECT USING (true);
CREATE POLICY wot_log_write ON wot_log FOR INSERT WITH CHECK (true);
CREATE POLICY wot_log_update ON wot_log FOR UPDATE USING (true);
