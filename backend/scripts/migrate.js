// Applies pending data migrations now instead of waiting for the next server
// start (which applies them automatically):
//   npm run migrate
import mongoose from "mongoose";
import { connectDB } from "#config/db.js";
import { runMigrations } from "#src/migrations/runner.js";

await connectDB();
try {
  const results = await runMigrations();
  console.log(JSON.stringify(results, null, 2));
  if (results.some(({ status }) => status === "failed")) process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
