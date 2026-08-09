const { connectDatabase, disconnectDatabase } = require("../src/config/db");
const { StaffUser } = require("../src/models");
const { logError } = require("../src/utils/safeLogger");

const knownDemoEmails = [
  "admin@drsohaibdemo.com",
  "doctor@drsohaibdemo.com",
  "reception@drsohaibdemo.com",
  "staff@drsohaibdemo.com"
];

async function auditDemoAccounts() {
  const accounts = await StaffUser.find({ email: { $in: knownDemoEmails } })
    .select("email role isActive createdAt lastLoginAt")
    .sort({ email: 1 })
    .lean();
  return accounts.map(({ email, role, isActive, createdAt, lastLoginAt }) => ({ email, role, isActive, createdAt, lastLoginAt }));
}

async function main() {
  await connectDatabase({ autoIndex: false });
  const accounts = await auditDemoAccounts();
  console.log(JSON.stringify({ demoAccountCount: accounts.length, accounts }, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      logError("Demo-account audit failed", error);
      process.exitCode = 1;
    })
    .finally(() => disconnectDatabase());
}

module.exports = { knownDemoEmails, auditDemoAccounts };
