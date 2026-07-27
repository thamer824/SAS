-- ===========================================================================
-- Mounaqasat — initial schema
--
-- Design notes
--  * `tenders` is a CANONICAL table: both TUNEPS sources (appels d'offres and
--    consultations) are normalised into it, which is the whole point of the
--    product — TUNEPS makes you search them separately.
--  * `search_blob` holds accent/diacritic-folded FR+AR+EN text so that FTS5
--    matches "electricite" against "Électricité" and "كهرباء" against
--    "كَهْرَبَاء". Folding happens in JS (src/lib/text/normalize.ts) because
--    SQLite's built-in tokenizers do not fold Arabic.
--  * `content_hash` lets ingestion detect real modifications (TUNEPS re-issues
--    notices with a bumped mod_seq or a moved deadline) so we can alert on
--    "deadline changed" rather than silently overwriting.
-- ===========================================================================

-- --- Identity --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL DEFAULT '',
  locale          TEXT NOT NULL DEFAULT 'fr',      -- 'fr' | 'ar'
  timezone        TEXT NOT NULL DEFAULT 'Africa/Tunis',
  telegram_chat_id TEXT,
  email_verified  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  last_seen_at    TEXT
);

CREATE TABLE IF NOT EXISTS orgs (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  -- Company profile drives the Go/No-Go fit score.
  tax_id          TEXT,                            -- matricule fiscal
  gov_code        TEXT,                            -- home governorate
  capabilities    TEXT NOT NULL DEFAULT '[]',      -- JSON array of keywords
  domain_codes    TEXT NOT NULL DEFAULT '[]',      -- JSON array of pbk codes
  plan            TEXT NOT NULL DEFAULT 'free',    -- free | pro | team
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS org_members (
  org_id          TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member',  -- owner | admin | member
  created_at      TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,                -- sha256 of the cookie value
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  user_agent      TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- --- Source data -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS buyers (
  code            TEXT PRIMARY KEY,                -- TUNEPS instCd
  name            TEXT NOT NULL,
  name_ar         TEXT,
  gov_code        TEXT,
  address         TEXT,
  tender_count    INTEGER NOT NULL DEFAULT 0,
  last_published_at TEXT,
  first_seen_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenders (
  id                  TEXT PRIMARY KEY,            -- 'ao:132955' | 'cons:344292'
  source              TEXT NOT NULL,               -- 'ao' | 'consultation'
  source_id           INTEGER NOT NULL,
  reference           TEXT NOT NULL,               -- bidNo / shopNo
  mod_seq             TEXT NOT NULL DEFAULT '00',
  buyer_ref           TEXT,                        -- the buyer's own refNo

  title_fr            TEXT NOT NULL DEFAULT '',
  title_ar            TEXT NOT NULL DEFAULT '',
  title_en            TEXT NOT NULL DEFAULT '',
  search_blob         TEXT NOT NULL DEFAULT '',

  buyer_code          TEXT,
  buyer_name          TEXT NOT NULL DEFAULT '',

  domain_code         TEXT,                        -- pbk: travaux/fournitures/services
  domain_label_fr     TEXT,
  domain_label_ar     TEXT,
  category_code       TEXT,                        -- bizKind
  category_label_fr   TEXT,
  category_label_ar   TEXT,
  procedure_code      TEXT,
  procedure_label_fr  TEXT,
  procedure_label_ar  TEXT,
  gov_code            TEXT,                        -- executionPlace
  gov_label_fr        TEXT,
  gov_label_ar        TEXT,
  place_detail        TEXT,

  is_online           INTEGER NOT NULL DEFAULT 1,
  is_international    INTEGER NOT NULL DEFAULT 0,
  is_framework        INTEGER NOT NULL DEFAULT 0,
  allows_consortium   INTEGER NOT NULL DEFAULT 0,
  is_real             INTEGER NOT NULL DEFAULT 1,  -- realYn: 'Avis réel' vs test

  doc_price           REAL,
  doc_currency        TEXT,
  guarantee_label_fr  TEXT,
  eval_label_fr       TEXT,
  price_type_label_fr TEXT,
  financing_label_fr  TEXT,
  validity_days       INTEGER,

  published_at        TEXT,                        -- ISO 8601, UTC
  receipt_start_at    TEXT,
  deadline_at         TEXT,                        -- the number that matters
  bid_open_at         TEXT,

  contact_name        TEXT,
  department          TEXT,
  address             TEXT,

  detail_fetched_at   TEXT,
  raw_json            TEXT,
  content_hash        TEXT NOT NULL,
  first_seen_at       TEXT NOT NULL,
  last_seen_at        TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenders_src ON tenders(source, source_id);
CREATE INDEX IF NOT EXISTS idx_tenders_published ON tenders(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenders_deadline ON tenders(deadline_at);
CREATE INDEX IF NOT EXISTS idx_tenders_buyer ON tenders(buyer_code);
CREATE INDEX IF NOT EXISTS idx_tenders_domain ON tenders(domain_code);
CREATE INDEX IF NOT EXISTS idx_tenders_gov ON tenders(gov_code);
CREATE INDEX IF NOT EXISTS idx_tenders_reference ON tenders(reference);
CREATE INDEX IF NOT EXISTS idx_tenders_detail_todo
  ON tenders(detail_fetched_at, published_at DESC);

-- Full-text index over the folded blob. `content=''` keeps it contentless: we
-- store only the index and join back on rowid = tenders.rowid.
CREATE VIRTUAL TABLE IF NOT EXISTS tenders_fts USING fts5(
  search_blob,
  reference,
  buyer_name,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Every meaningful change to a notice, so we can alert on "deadline moved".
CREATE TABLE IF NOT EXISTS tender_revisions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id       TEXT NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                   -- new | deadline | title | modseq | other
  before_json     TEXT,
  after_json      TEXT,
  detected_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revisions_tender ON tender_revisions(tender_id, detected_at DESC);

-- --- Watchlists (the core service) ----------------------------------------

CREATE TABLE IF NOT EXISTS watchlists (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  -- JSON criteria: { keywords[], excludeKeywords[], buyerCodes[], domainCodes[],
  --   categoryCodes[], govCodes[], procedureCodes[], sources[],
  --   minLeadDays, onlineOnly, internationalOnly, minScore }
  criteria        TEXT NOT NULL DEFAULT '{}',
  cadence         TEXT NOT NULL DEFAULT 'instant',  -- instant | daily | weekly | off
  channels        TEXT NOT NULL DEFAULT '["inapp","email"]',
  is_active       INTEGER NOT NULL DEFAULT 1,
  match_count     INTEGER NOT NULL DEFAULT 0,
  last_matched_at TEXT,
  last_digest_at  TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_watchlists_org ON watchlists(org_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_active ON watchlists(is_active, cadence);

CREATE TABLE IF NOT EXISTS watchlist_matches (
  watchlist_id    TEXT NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  tender_id       TEXT NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  score           REAL NOT NULL DEFAULT 0,
  reasons         TEXT NOT NULL DEFAULT '[]',       -- JSON, "why did this match"
  matched_at      TEXT NOT NULL,
  notified_at     TEXT,
  PRIMARY KEY (watchlist_id, tender_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_pending ON watchlist_matches(notified_at, matched_at);
CREATE INDEX IF NOT EXISTS idx_matches_tender ON watchlist_matches(tender_id);

-- --- Notifications ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                   -- match | deadline | digest | system
  title           TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  url             TEXT,
  meta            TEXT NOT NULL DEFAULT '{}',
  read_at         TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS deliveries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL,                   -- email | webpush | telegram
  subject         TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL,                   -- sent | failed | skipped
  error           TEXT,
  payload_digest  TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deliveries_user ON deliveries(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              TEXT PRIMARY KEY,                -- sha256 of endpoint
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL,
  p256dh          TEXT NOT NULL,
  auth            TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  failed_count    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- --- Pipeline (bid tracking — TUNEPS has no equivalent) -------------------

CREATE TABLE IF NOT EXISTS pipeline_items (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  tender_id       TEXT NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  stage           TEXT NOT NULL DEFAULT 'watching', -- watching | qualifying | preparing | submitted | won | lost | skipped
  owner_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes           TEXT NOT NULL DEFAULT '',
  expected_value  REAL,
  checklist       TEXT NOT NULL DEFAULT '[]',       -- JSON [{label, done}]
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (org_id, tender_id)
);
CREATE INDEX IF NOT EXISTS idx_pipeline_org ON pipeline_items(org_id, stage);

CREATE TABLE IF NOT EXISTS pipeline_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id         TEXT NOT NULL REFERENCES pipeline_items(id) ON DELETE CASCADE,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL,                    -- stage | note | checklist
  detail          TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_item ON pipeline_events(item_id, created_at DESC);

-- --- Integrations ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS api_tokens (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  token_hash      TEXT NOT NULL UNIQUE,
  prefix          TEXT NOT NULL,
  scope           TEXT NOT NULL DEFAULT 'read',
  last_used_at    TEXT,
  created_at      TEXT NOT NULL
);

-- Unguessable per-watchlist token so a calendar client can subscribe to the
-- ICS feed without cookies.
CREATE TABLE IF NOT EXISTS feed_tokens (
  token           TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,                    -- ics-watchlist | ics-pipeline
  org_id          TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  ref_id          TEXT,
  created_at      TEXT NOT NULL
);

-- --- Ingestion bookkeeping -------------------------------------------------

CREATE TABLE IF NOT EXISTS sync_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source          TEXT NOT NULL,
  mode            TEXT NOT NULL,                    -- incremental | backfill | detail
  started_at      TEXT NOT NULL,
  finished_at     TEXT,
  fetched         INTEGER NOT NULL DEFAULT 0,
  inserted        INTEGER NOT NULL DEFAULT 0,
  updated         INTEGER NOT NULL DEFAULT 0,
  matched         INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'running',
  error           TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_source ON sync_runs(source, started_at DESC);

CREATE TABLE IF NOT EXISTS kv (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
