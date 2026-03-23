// ============================================================
// Neo4j Knowledge Graph Schema
// Initializes constraints, indexes, full-text, and vector indexes
// ============================================================

// --- Uniqueness constraints ---

CREATE CONSTRAINT requirement_id IF NOT EXISTS FOR (r:Requirement) REQUIRE r.id IS UNIQUE;
CREATE CONSTRAINT testcase_id IF NOT EXISTS FOR (t:TestCase) REQUIRE t.id IS UNIQUE;
CREATE CONSTRAINT pageobject_id IF NOT EXISTS FOR (p:PageObject) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT helper_id IF NOT EXISTS FOR (h:Helper) REQUIRE h.id IS UNIQUE;
CREATE CONSTRAINT fixture_id IF NOT EXISTS FOR (f:Fixture) REQUIRE f.id IS UNIQUE;
CREATE CONSTRAINT defect_id IF NOT EXISTS FOR (d:Defect) REQUIRE d.id IS UNIQUE;

// --- Composite indexes on (projectId, status) ---

CREATE INDEX requirement_project_status IF NOT EXISTS FOR (r:Requirement) ON (r.projectId, r.status);
CREATE INDEX testcase_project_status IF NOT EXISTS FOR (t:TestCase) ON (t.projectId, t.status);
CREATE INDEX pageobject_project_status IF NOT EXISTS FOR (p:PageObject) ON (p.projectId, p.status);
CREATE INDEX helper_project_status IF NOT EXISTS FOR (h:Helper) ON (h.projectId, h.status);
CREATE INDEX fixture_project_status IF NOT EXISTS FOR (f:Fixture) ON (f.projectId, f.status);
CREATE INDEX defect_project_status IF NOT EXISTS FOR (d:Defect) ON (d.projectId, d.status);

// --- Full-text indexes ---

CREATE FULLTEXT INDEX requirement_fulltext IF NOT EXISTS FOR (r:Requirement) ON EACH [r.title, r.body];
CREATE FULLTEXT INDEX testcase_fulltext IF NOT EXISTS FOR (t:TestCase) ON EACH [t.title, t.sourceContent];

// --- Vector indexes (1536 dimensions, cosine similarity) ---

CREATE VECTOR INDEX requirement_embedding IF NOT EXISTS FOR (r:Requirement) ON (r.embedding) OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}};
CREATE VECTOR INDEX testcase_embedding IF NOT EXISTS FOR (t:TestCase) ON (t.embedding) OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}};
