// Applies migrations to the test database. The testEnv import must come first — it rewrites
// DATABASE_URL before migrate.ts (which runs on import) creates its pool.
import "./testEnv";
import "../src/db/migrate";
