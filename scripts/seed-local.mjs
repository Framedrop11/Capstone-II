import mongoose from "mongoose";
import {
  Patient,
  User,
} from "../dist/core-api/services/core-api/src/data/models.js";

const uri = process.env["MONGODB_URI"];
if (!uri) throw new Error("MONGODB_URI is required for local seed data");
await mongoose.connect(uri, {
  dbName: process.env["MONGODB_DATABASE"] ?? "carelens",
  autoIndex: false,
});
try {
  const identities = [
    {
      role: "patient",
      subject: "stage2-mock-user",
      name: "Riya Demo",
      email: "mock-patient@example.test",
    },
    {
      role: "doctor",
      subject: "stage2-mock-doctor",
      name: "Dr. Mehta Demo",
      email: "mock-doctor@example.test",
    },
    {
      role: "admin",
      subject: "stage2-mock-admin",
      name: "CareLens Admin Demo",
      email: "mock-admin@example.test",
    },
  ];
  for (const identity of identities) {
    const user = await User.findOneAndUpdate(
      { authProvider: `mock:${identity.subject}` },
      {
        $set: {
          name: identity.name,
          email: identity.email,
          role: identity.role,
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).exec();
    if (!user)
      throw new Error(`Could not seed local mock ${identity.role} identity`);
    if (identity.role === "patient") {
      await Patient.updateOne(
        { userId: user._id },
        { $setOnInsert: { userId: user._id } },
        { upsert: true, runValidators: true, setDefaultsOnInsert: true },
      ).exec();
    }
    process.stdout.write(
      `${JSON.stringify({ event: "synthetic_seed_complete", role: identity.role, email: user.email })}\n`,
    );
  }
} finally {
  await mongoose.disconnect();
}
