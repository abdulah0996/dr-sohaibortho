const { connectDatabase, disconnectDatabase } = require("../src/config/db");
const { setupSuperAdmin, publicStaffUser } = require("../src/services/authService");
const { audit } = require("../src/services/auditService");
const { logError } = require("../src/utils/safeLogger");

async function main() {
  const name = String(process.env.BOOTSTRAP_ADMIN_NAME || "").trim();
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || "");
  if (!name || !email || !password) {
    throw new Error("Set BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD temporarily before running this command.");
  }
  await connectDatabase({ autoIndex: false });
  const user = await setupSuperAdmin({ name, email, password });
  await audit({ actorType: "system", action: "staff.super_admin_bootstrapped", entityType: "staff", entityId: String(user._id) });
  const safeUser = publicStaffUser(user);
  console.log(`Super Admin created for ${safeUser.email}. Remove the temporary BOOTSTRAP_ADMIN_* variables now.`);
}

main()
  .catch((error) => {
    logError("Super Admin bootstrap failed", error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
