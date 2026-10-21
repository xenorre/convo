import mongoose from "mongoose";

// One document per data migration: who is running it and whether it is done.
const migrations = new mongoose.Schema({
  _id: { type: String, required: true },
  status: { type: String, enum: ["running", "done"], required: true },
  startedAt: { type: Date, required: true },
  finishedAt: { type: Date, default: null },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
});

const Migration = mongoose.model("Migration", migrations);

export default Migration;
