ALTER TABLE skills RENAME TO legacy_skills;
ALTER TABLE skill_versions RENAME TO legacy_skill_versions;

DROP INDEX IF EXISTS idx_skills_owner_updated_at;
DROP INDEX IF EXISTS idx_skills_owner_enabled;
DROP INDEX IF EXISTS idx_skill_versions_skill_version;
DROP INDEX IF EXISTS idx_skill_versions_owner_created_at;

CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  owner_tg_user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  draft_files_json TEXT NOT NULL,
  draft_metadata_json TEXT NOT NULL,
  draft_body TEXT NOT NULL,
  draft_file_inventory_json TEXT NOT NULL,
  draft_validation_json TEXT NOT NULL,
  draft_content_hash TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  deleted_at INTEGER,
  published_version_id TEXT,
  published_version INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_skills_owner_name_active
  ON skills (owner_tg_user_id, name, deleted_at);

CREATE INDEX idx_skills_owner_updated_at
  ON skills (owner_tg_user_id, updated_at DESC);

CREATE INDEX idx_skills_owner_enabled
  ON skills (owner_tg_user_id, enabled, deleted_at);

CREATE TABLE skill_versions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  files_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  body TEXT NOT NULL,
  file_inventory_json TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (skill_id, version)
);

CREATE INDEX idx_skill_versions_skill_version
  ON skill_versions (skill_id, version DESC);

CREATE INDEX idx_skill_versions_owner_created_at
  ON skill_versions (owner_tg_user_id, created_at DESC);

WITH legacy_skill_packages AS (
  SELECT
    *,
    lower(
      trim(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(coalesce(json_extract(draft_manifest_json, '$.name'), id), '_', '-'),
                  ' ',
                  '-'
                ),
                '/',
                '-'
              ),
              '.',
              '-'
            ),
            ':',
            '-'
          ),
          '--',
          '-'
        ),
        '-'
      )
    ) AS candidate_name
  FROM legacy_skills
),
normalized_skill_packages AS (
  SELECT
    *,
    CASE
      WHEN candidate_name = ''
        OR candidate_name GLOB '*[^a-z0-9-]*'
        OR candidate_name LIKE '-%'
        OR candidate_name LIKE '%-'
      THEN 'legacy-' || lower(hex(id))
      ELSE candidate_name
    END AS package_name
  FROM legacy_skill_packages
),
validated_skill_packages AS (
  SELECT
    *,
    CASE
      WHEN deleted_at IS NULL
        AND sum(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END)
          OVER (PARTITION BY owner_tg_user_id, package_name) > 1
      THEN 1
      ELSE 0
    END AS name_conflict
  FROM normalized_skill_packages
)
INSERT INTO skills (
  id,
  owner_tg_user_id,
  name,
  description,
  draft_files_json,
  draft_metadata_json,
  draft_body,
  draft_file_inventory_json,
  draft_validation_json,
  draft_content_hash,
  enabled,
  deleted_at,
  published_version_id,
  published_version,
  created_at,
  updated_at
)
SELECT
  id,
  owner_tg_user_id,
  package_name AS name,
  coalesce(json_extract(draft_manifest_json, '$.description'), 'Migrated legacy skill') AS description,
  json_object(
    'SKILL.md',
    '---' || char(10) ||
    'name: ' || package_name || char(10) ||
    'description: ' || json_quote(coalesce(json_extract(draft_manifest_json, '$.description'), 'Migrated legacy skill')) || char(10) ||
    '---' || char(10) ||
    coalesce(json_extract(draft_manifest_json, '$.instructions'), '')
  ) AS draft_files_json,
  json_object(
    'name',
    package_name,
    'description',
    coalesce(json_extract(draft_manifest_json, '$.description'), 'Migrated legacy skill'),
    'allowedTools',
    coalesce(json_extract(draft_manifest_json, '$.allowedTools'), json('[]')),
    'raw',
    json_object(
      'source',
      'legacy-chat-manifest',
      'legacyId',
      id
    )
  ) AS draft_metadata_json,
  coalesce(json_extract(draft_manifest_json, '$.instructions'), '') AS draft_body,
  json_array(
    json_object(
      'path',
      'SKILL.md',
      'directory',
      'root',
      'sizeBytes',
      length(coalesce(json_extract(draft_manifest_json, '$.instructions'), ''))
    )
  ) AS draft_file_inventory_json,
  CASE
    WHEN name_conflict = 1
    THEN json_object(
      'ok',
      json('false'),
      'errors',
      json_array(json_object('path', 'SKILL.md:name', 'message', 'Migrated legacy skill name conflicts with another active skill')),
      'warnings',
      json_array()
    )
    ELSE json_object('ok', json('true'), 'errors', json_array(), 'warnings', json_array())
  END AS draft_validation_json,
  'legacy-' || id || '-' || updated_at AS draft_content_hash,
  enabled,
  deleted_at,
  published_version_id,
  published_version,
  created_at,
  updated_at
FROM validated_skill_packages;

WITH legacy_version_packages AS (
  SELECT
    v.*,
    s.deleted_at AS skill_deleted_at,
    lower(
      trim(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(coalesce(json_extract(v.manifest_json, '$.name'), v.skill_id), '_', '-'),
                  ' ',
                  '-'
                ),
                '/',
                '-'
              ),
              '.',
              '-'
            ),
            ':',
            '-'
          ),
          '--',
          '-'
        ),
        '-'
      )
    ) AS candidate_name
  FROM legacy_skill_versions v
  JOIN legacy_skills s ON s.id = v.skill_id
),
normalized_version_packages AS (
  SELECT
    *,
    CASE
      WHEN candidate_name = ''
        OR candidate_name GLOB '*[^a-z0-9-]*'
        OR candidate_name LIKE '-%'
        OR candidate_name LIKE '%-'
      THEN 'legacy-' || lower(hex(skill_id))
      ELSE candidate_name
    END AS package_name
  FROM legacy_version_packages
),
validated_version_packages AS (
  SELECT
    *,
    CASE
      WHEN skill_deleted_at IS NULL
        AND sum(CASE WHEN skill_deleted_at IS NULL THEN 1 ELSE 0 END)
          OVER (PARTITION BY owner_tg_user_id, package_name) > 1
      THEN 1
      ELSE 0
    END AS name_conflict
  FROM normalized_version_packages
)
INSERT INTO skill_versions (
  id,
  skill_id,
  owner_tg_user_id,
  version,
  name,
  description,
  files_json,
  metadata_json,
  body,
  file_inventory_json,
  validation_json,
  content_hash,
  created_at
)
SELECT
  id,
  skill_id,
  owner_tg_user_id,
  version,
  package_name AS name,
  coalesce(json_extract(manifest_json, '$.description'), 'Migrated legacy skill') AS description,
  json_object(
    'SKILL.md',
    '---' || char(10) ||
    'name: ' || package_name || char(10) ||
    'description: ' || json_quote(coalesce(json_extract(manifest_json, '$.description'), 'Migrated legacy skill')) || char(10) ||
    '---' || char(10) ||
    coalesce(json_extract(manifest_json, '$.instructions'), '')
  ) AS files_json,
  json_object(
    'name',
    package_name,
    'description',
    coalesce(json_extract(manifest_json, '$.description'), 'Migrated legacy skill'),
    'allowedTools',
    coalesce(json_extract(manifest_json, '$.allowedTools'), json('[]')),
    'raw',
    json_object(
      'source',
      'legacy-chat-manifest',
      'legacySkillId',
      skill_id
    )
  ) AS metadata_json,
  coalesce(json_extract(manifest_json, '$.instructions'), '') AS body,
  json_array(
    json_object(
      'path',
      'SKILL.md',
      'directory',
      'root',
      'sizeBytes',
      length(coalesce(json_extract(manifest_json, '$.instructions'), ''))
    )
  ) AS file_inventory_json,
  CASE
    WHEN name_conflict = 1
    THEN json_object(
      'ok',
      json('false'),
      'errors',
      json_array(json_object('path', 'SKILL.md:name', 'message', 'Migrated legacy skill name conflicts with another active skill')),
      'warnings',
      json_array()
    )
    ELSE json_object('ok', json('true'), 'errors', json_array(), 'warnings', json_array())
  END AS validation_json,
  'legacy-' || skill_id || '-' || version || '-' || created_at AS content_hash,
  created_at
FROM validated_version_packages;

DROP TABLE legacy_skill_versions;
DROP TABLE legacy_skills;

ALTER TABLE skill_route_decisions ADD COLUMN matched_skill_name TEXT;
ALTER TABLE skill_route_decisions ADD COLUMN candidates_json TEXT NOT NULL DEFAULT '[]';
