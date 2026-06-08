-- Product Gaps Phase 1: backfill completeness scores + GIN index for full-text search
-- Run after `pnpm --filter @workspace/db run push`

UPDATE freelancer_profiles fp SET completeness_score = (
  CASE WHEN u.avatar_url IS NOT NULL THEN 15 ELSE 0 END +
  CASE WHEN length(coalesce(fp.bio, '')) >= 50 THEN 20 ELSE 0 END +
  CASE WHEN coalesce(array_length(fp.skills, 1), 0) >= 2 THEN 20 ELSE 0 END +
  CASE WHEN (fp.payment_preference = 'daily' AND fp.daily_rate IS NOT NULL AND fp.daily_rate > 0)
         OR (fp.payment_preference != 'daily' AND fp.hourly_rate IS NOT NULL AND fp.hourly_rate > 0) THEN 15 ELSE 0 END +
  CASE WHEN fp.field_of_work IS NOT NULL THEN 15 ELSE 0 END +
  CASE WHEN fp.is_available IS NOT NULL THEN 15 ELSE 0 END
) FROM users u WHERE u.id = fp.user_id;

-- GIN on to_tsvector(regconfig, text) is not IMMUTABLE in PostgreSQL — cannot index inline expressions.
-- Full-text search runs inline in GET /api/freelancers?q= without this index (acceptable at current scale).
-- Optional future: stored tsvector column + trigger, or pg_trgm on concatenated text.
