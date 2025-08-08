ALTER TABLE "CrawlQueue" ADD COLUMN IF NOT EXISTS depth INT DEFAULT 0;
ALTER TABLE "CrawlQueue" ADD COLUMN IF NOT EXISTS domain TEXT;
CREATE INDEX IF NOT EXISTS crawlqueue_processed_idx ON "CrawlQueue" (processed, depth);
