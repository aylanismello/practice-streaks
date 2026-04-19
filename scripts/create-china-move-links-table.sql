CREATE TABLE IF NOT EXISTS china_move_links (
  move_number integer PRIMARY KEY CHECK (move_number BETWEEN 1 AND 24),
  youtube_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS china_move_links_set_updated_at ON china_move_links;
CREATE TRIGGER china_move_links_set_updated_at
BEFORE UPDATE ON china_move_links
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE china_move_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY china_move_links_read ON china_move_links FOR SELECT USING (true);
CREATE POLICY china_move_links_write ON china_move_links FOR INSERT WITH CHECK (true);
CREATE POLICY china_move_links_update ON china_move_links FOR UPDATE USING (true);
