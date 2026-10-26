// Seeds the three Health Center counsellors into the test database. The suite asserts they
// exist ("three counsellors seeded"). testEnv must be imported first for the DATABASE_URL swap.
import "./testEnv";
import "../src/db/seed";
