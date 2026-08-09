const { writeFileSync } = require("node:fs");
const path = require("node:path");
const { expandEndpointPolicies } = require("../src/security/endpointPolicy");

const labels = {
  public_read: "Public read-only",
  public_limited: "Public, rate-limited",
  public_health: "Public health check",
  patient_verified: "Patient phone + appointment ownership",
  meta_verification: "Meta verify token",
  meta_signed: "Meta HMAC signature",
  session_cookie: "Signed refresh cookie",
  staff_authenticated: "Any active staff account",
  staff_permission: "Authenticated staff + permission"
};

const rows = expandEndpointPolicies().map((policy) => {
  const requirements = policy.permissions.length ? policy.permissions.join(policy.permissionMode === "all" ? " + " : " OR ") : labels[policy.access];
  const roles = policy.roles.length ? policy.roles.map((role) => role.replaceAll("_", " ")).join(", ") : "None";
  return `| ${policy.method} | \`${policy.path}\` | ${requirements} | ${roles} |`;
});

const content = `# Endpoint permission report

Generated from the executable endpoint policy and checked against every Express router by the integration suite. Aliased mounts are listed separately because they are independently reachable URLs.

| Method | Endpoint | Required access | Authorized staff roles |
|---|---|---|---|
${rows.join("\n")}

## Enforcement notes

- An appointment ID alone never authorizes lookup, confirmation, cancellation, rescheduling, or report upload. Patient self-service routes require the matching phone number and appointment ownership.
- Medical download and report APIs are staff-only; private storage keys and permanent URLs are not returned.
- The WhatsApp callback is public only at Meta's required webhook paths: verification uses the verify token, while events require the raw-body HMAC signature.
- Public submission routes are rate-limited and return deliberately restricted response DTOs.
- The Super Admin wildcard is intentional. Other roles are evaluated against the permission names in the table, including combined dashboard/router requirements.
`;

const target = path.resolve(__dirname, "../docs/ENDPOINT_PERMISSION_REPORT.md");
writeFileSync(target, content, "utf8");
console.log(`Wrote ${rows.length} endpoint policies to ${target}`);
