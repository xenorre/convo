import mongoose from "mongoose";

export const validateObjectIdParam = (paramName = "id") => (req, res, next) => {
  const id = req.params[paramName];
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid ID format" });
  }
  next();
};