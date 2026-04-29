CREATE TABLE IF NOT EXISTS wot_log (
  date date PRIMARY KEY,
  score integer NOT NULL CHECK (score BETWEEN 1 AND 5),
  -- 'deep_red' kept for legacy rows logged before the 5-tier rename.
  color text NOT NULL CHECK (color IN ('red', 'orange', 'yellow', 'yellow_green', 'green', 'deep_red')),
  legacy_color text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE wot_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY wot_log_read ON wot_log FOR SELECT USING (true);
CREATE POLICY wot_log_write ON wot_log FOR INSERT WITH CHECK (true);
CREATE POLICY wot_log_update ON wot_log FOR UPDATE USING (true);
