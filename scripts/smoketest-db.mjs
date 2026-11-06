/**
 * ClubPulse DB + auth smoke test.
 *
 * Why this exists: the production Neon database was once missing every table
 * (`public.users` did not exist). next-auth v4 then failed inside
 * `adapter.createUser` and redirected to
 * `/api/auth/error?error=OAuthCreateAccount`, which renders the generic
 * "Try signing in with a different account." message. The Vercel build only
 * runs `prisma generate`, never `prisma migrate deploy`, so a reset / fresh
 * environment silently breaks login again.
 *
 * Run:
 *   npm run db:smoke
 *
 * Needs DATABASE_URL in the environment (e.g. `npx dotenv -e .env.local -- ...`).
 * Creates a throwaway user, exercises the whole next-auth adapter path, then
 * deletes it again (accounts/sessions cascade).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaAdapter } from "@auth/prisma-adapter";

const prisma = new PrismaClient();
const adapter = PrismaAdapter(prisma);

const EMAIL = "__clubpulse_smoketest__@example.com";
const TOKEN = "smoketest-session-token";
const PID = "smoketest-pid";

let createdId = null;

async function cleanup() {
  if (!createdId) return;
  await prisma.user.delete({ where: { id: createdId } }); // cascades accounts + sessions
  createdId = null;
}

try {
  console.log("1) adapter.createUser");
  const user = await adapter.createUser({
    name: "Smoke Test",
    email: EMAIL,
    emailVerified: null,
    image: null,
    role: "GUEST",
    specificRole: null,
  });
  createdId = user.id;
  console.log(`   OK -> id=${user.id} role=${user.role}`);

  console.log("2) adapter.linkAccount");
  await adapter.linkAccount({
    userId: user.id,
    type: "oauth",
    provider: "google",
    providerAccountId: PID,
    access_token: "x",
    refresh_token: "x",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "Bearer",
    scope: "openid email profile",
    id_token: "x",
    session_state: "x",
  });
  console.log("   OK -> google/" + PID);

  console.log("3) adapter.createSession");
  await adapter.createSession({
    sessionToken: TOKEN,
    userId: user.id,
    expires: new Date(Date.now() + 3600_000),
  });
  console.log("   OK -> " + TOKEN);

  console.log("4) adapter.getSessionAndUser (what /api/auth/session calls)");
  const found = await adapter.getSessionAndUser(TOKEN);
  if (!found) throw new Error("getSessionAndUser returned null for a live session");
  console.log(`   OK -> ${found.user.email} role=${found.user.role}`);

  console.log("5) adapter.getUserByEmail");
  const byEmail = await adapter.getUserByEmail(EMAIL);
  if (!byEmail) throw new Error("getUserByEmail returned null for a user that exists");
  console.log("   OK -> " + byEmail.email);

  console.log("6) adapter.getUserByAccount");
  const byAccount = await adapter.getUserByAccount({
    providerAccountId: PID,
    provider: "google",
  });
  if (!byAccount) throw new Error("getUserByAccount returned null for a linked account");
  console.log("   OK -> " + byAccount.email);

  await cleanup();
  console.log("\nDB SMOKE TEST PASSED");
} catch (error) {
  console.error("\nDB SMOKE TEST FAILED:", error.message);
  if (error.code === "P2021") {
    console.error("-> a table is missing. Run: npm run db:deploy");
  }
  process.exitCode = 1;
} finally {
  await cleanup().catch(() => {});
  await prisma.$disconnect();
}
