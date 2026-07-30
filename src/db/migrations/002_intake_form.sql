-- ===========================================================================
-- The intake form becomes first-class.
--
-- The account-creation questionnaire (company / sectors / regions / how to be
-- notified) is no longer a convenience wrapper around a "watchlist" — it IS the
-- user's profile, and it has to be re-openable and editable as one object.
-- Storing the answers on `orgs` and `users` (rather than only inside a
-- watchlist's criteria JSON) means the app can render "vos critères" in plain
-- language anywhere without parsing JSON, and the form can be pre-filled.
-- ===========================================================================

-- WhatsApp is the channel this market actually reads. Stored on the user rather
-- than the org because notification delivery is personal even in a team.
ALTER TABLE users ADD COLUMN whatsapp_number TEXT;

-- 'all' = toute la Tunisie, 'regions' = an explicit list in orgs.gov_codes.
-- Kept as an explicit mode instead of inferring from an empty list, because
-- "everywhere" and "not answered yet" must not look the same.
ALTER TABLE orgs ADD COLUMN region_scope TEXT NOT NULL DEFAULT 'all';

-- The regions chosen when region_scope = 'regions'. JSON array of gov codes.
ALTER TABLE orgs ADD COLUMN gov_codes TEXT NOT NULL DEFAULT '[]';

-- The sectors chosen in the form. JSON array of TUNEPS bizKind codes.
ALTER TABLE orgs ADD COLUMN category_codes TEXT NOT NULL DEFAULT '[]';

-- 'email' | 'whatsapp' | 'both' — exactly the three options the form offers.
ALTER TABLE orgs ADD COLUMN notify_channel TEXT NOT NULL DEFAULT 'email';

-- Set once the questionnaire has been answered, so the app knows whether to
-- send someone to the form or to their offers.
ALTER TABLE orgs ADD COLUMN intake_completed_at TEXT;

-- The single watchlist the form maintains. A user who never opens the advanced
-- screens has exactly one, and editing the form updates it in place rather than
-- accumulating duplicates.
ALTER TABLE orgs ADD COLUMN primary_watchlist_id TEXT;
