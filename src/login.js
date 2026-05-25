/**
 * RSI Login CLI
 *
 * Opens browser to RSI sign-in, waits for user to complete login,
 * then saves session data for subsequent scraping.
 *
 * Usage: node login.js
 */

const path = require("path");
const { login, saveSession, LOGIN_URL } = require("./hangar");

const PROJECT_ROOT = path.resolve(__dirname, "..");

async function main() {
  const userDataDir = path.join(PROJECT_ROOT, "user_data");

  console.log("=".repeat(60));
  console.log("  Star Citizen RSI - Interactive Login");
  console.log("=".repeat(60));
  console.log(`  User data: ${userDataDir}`);
  console.log();

  const { context, page, cleanup } = await login(userDataDir, {
    onStatus: ({ phase, url }) => {
      if (phase === "waiting") {
        console.log("Browser opened - please log in to your RSI account.");
        console.log("Complete any 2FA / reCAPTCHA as needed.");
        console.log();
        console.log("Waiting for login to complete...");
        console.log("  (Auto-detects redirect away from sign-in page)");
        console.log("  (Press Ctrl+C to abort)");
        console.log();
      } else if (phase === "detected") {
        console.log(`[OK] Login detected! Redirected to: ${url}`);
      } else if (phase === "verified") {
        console.log(`[OK] Hangar page verified: ${url}`);
      }
    },
  });

  // Save session state
  await saveSession(context, page, PROJECT_ROOT);
  console.log("[OK] Cookies saved: cookies.json");
  console.log("[OK] LocalStorage saved: local_storage.json");

  console.log();
  console.log("=".repeat(60));
  console.log("  Login successful! Session saved.");
  console.log("=".repeat(60));

  // Keep browser open briefly for review
  await new Promise((r) => setTimeout(r, 3000));
  await cleanup();

  console.log("Done.");
}

main().catch((err) => {
  if (err.code === "LOGIN_TIMEOUT") {
    console.error(`\n[ERROR] ${err.message}`);
    console.error("Browser closed. Please re-run to try again.");
  } else if (err.code === "LOGIN_FAILED") {
    console.error(`\n[ERROR] ${err.message}`);
  } else {
    console.error("Fatal error:", err);
  }
  process.exit(1);
});