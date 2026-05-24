// Standalone smoke test — exercises auth + client without going through MCP.
// Run: set -a; source .env; set +a; npx tsx scripts/smoke.ts
import { loadCredentialsFromEnv } from "../src/auth.js";
import { AscClient } from "../src/client.js";

async function main(): Promise<void> {
  const creds = loadCredentialsFromEnv();
  console.error(`Using key ${creds.keyId} for issuer ${creds.issuerId}`);
  const client = new AscClient(creds);
  const res = await client.request<{ data: Array<{ id: string; attributes: { name: string; bundleId: string } }> }>(
    "/apps",
    { query: { limit: 1 } },
  );
  if (!res.data || res.data.length === 0) {
    console.error("Auth works, but no apps found in this account.");
    return;
  }
  const app = res.data[0];
  console.error(`OK — first app: ${app.attributes.name} (${app.attributes.bundleId}) id=${app.id}`);
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
