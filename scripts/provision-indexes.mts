import { ensureIndexes } from "../src/lib/db.ts";

try {
  await ensureIndexes();
  console.log("Dropday database index migrations are current.");
} catch (error) {
  console.error(
    "Dropday database index migration failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
