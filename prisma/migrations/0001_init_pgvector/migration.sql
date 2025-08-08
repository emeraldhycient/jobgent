-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector column (using 768 dims default for MiniLM; adjust if model differs)
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS embedding_vector vector(768);

-- Backfill existing JSON embedding into vector column (best-effort)
DO $$
DECLARE r RECORD; v FLOAT8[]; len INT; sql TEXT;
BEGIN
  FOR r IN SELECT id, embedding FROM "Job" WHERE embedding IS NOT NULL LOOP
    BEGIN
      SELECT jsonb_array_elements_text(to_jsonb(r.embedding)::jsonb)::float8 INTO v;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
  END LOOP;
END$$;

-- (Optional) Create index for similarity search
CREATE INDEX IF NOT EXISTS job_embedding_vector_ivfflat ON "Job" USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100);
