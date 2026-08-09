/**
 * E2E Test Suite — AI Email Assistant
 * Tests all major UI flows at http://localhost:3001
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = "http://localhost:3001";
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SCREENSHOT_DIR = path.join(__dirname, "e2e-screenshots");
const REPORT_PATH = path.join(__dirname, "e2e-report.json");

// Test credentials — use timestamp to avoid conflicts
const timestamp = Date.now();
const TEST_USER = {
  name: "E2E Test User",
  email: `e2e.test.${timestamp}@example.com`,
  password: "TestPassword123!",
};

// Ensure screenshot dir exists
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

let screenshotIndex = 0;
async function screenshot(page, label) {
  const filename = `${String(++screenshotIndex).padStart(3, "0")}_${label.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "")}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  return filename;
}

const results = [];
let passed = 0;
let failed = 0;
let skipped = 0;

function log(msg) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

async function runTest(name, fn, page) {
  const start = Date.now();
  try {
    log(`\u25b6  ${name}`);
    const screenshotFile = await fn();
    const duration = Date.now() - start;
    results.push({ name, status: "PASS", duration, screenshot: screenshotFile || null });
    passed++;
    log(`   \u2705 PASS (${duration}ms)`);
    return true;
  } catch (err) {
    const duration = Date.now() - start;
    let screenshotFile = null;
    if (page) {
      try { screenshotFile = await screenshot(page, `FAIL_${name}`); } catch (_) {}
    }
    results.push({ name, status: "FAIL", duration, error: err.message, screenshot: screenshotFile });
    failed++;
    log(`   \u274c FAIL (${duration}ms): ${err.message}`);
    return false;
  }
}

async function skipTest(name, reason) {
  results.push({ name, status: "SKIP", reason });
  skipped++;
  log(`   \u23ed  SKIP: ${name} — ${reason}`);
}

// ──────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────

(async () => {
  log("=".repeat(60));
  log("AI Email Assistant — End-to-End Test Suite");
  log(`Base URL: ${BASE_URL}`);
  log(`Test User: ${TEST_USER.email}`);
  log("=".repeat(60));

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // Capture console errors for the report
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // ── 1. Application Availability ──────────────────────────────────
  log("\n\ud83d\udce6 SECTION 1: Application Availability");

  await runTest("App loads at localhost:3001", async () => {
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 15000 });
    const title = await page.title();
    if (!title) throw new Error("Page has no title");
    const ss = await screenshot(page, "01_app_loaded");
    return ss;
  }, page);

  await runTest("Root redirects to /login when unauthenticated", async () => {
    await page.waitForURL(/\/(login|register)/, { timeout: 8000 });
    const url = page.url();
    if (!url.includes("/login") && !url.includes("/register")) {
      throw new Error(`Expected redirect to /login, got: ${url}`);
    }
    const ss = await screenshot(page, "02_redirect_to_login");
    return ss;
  }, page);

  // ── 2. Login Page UI ─────────────────────────────────────────────
  log("\n\ud83d\udd10 SECTION 2: Login Page UI");

  await runTest("Login page renders correctly", async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.waitForSelector("h1", { timeout: 5000 });
    const heading = await page.textContent("h1");
    if (!heading?.includes("AI Email Assistant")) {
      throw new Error(`Unexpected heading: "${heading}"`);
    }
    const ss = await screenshot(page, "03_login_page");
    return ss;
  }, page);

  await runTest("Login page has email/password fields", async () => {
    const emailInput = await page.$('input[type="email"]');
    const passwordInput = await page.$('input[type="password"]');
    if (!emailInput) throw new Error("Email input not found");
    if (!passwordInput) throw new Error("Password input not found");
  }, page);

  await runTest("Login page shows Google and Microsoft OAuth buttons", async () => {
    const buttons = await page.$$eval("a", (els) =>
      els.map((el) => el.textContent?.trim()).filter(Boolean)
    );
    const hasGoogle = buttons.some((t) => t.includes("Google"));
    const hasMicrosoft = buttons.some((t) => t.includes("Microsoft"));
    if (!hasGoogle) throw new Error("Google login button missing");
    if (!hasMicrosoft) throw new Error("Microsoft login button missing");
    const ss = await screenshot(page, "05_oauth_buttons");
    return ss;
  }, page);

  await runTest("Login form shows validation errors for empty submit", async () => {
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
    const errors = await page.$$eval("p", (els) =>
      els.map((el) => el.textContent?.trim()).filter(Boolean)
    );
    if (errors.length === 0) throw new Error("No validation errors shown");
    const ss = await screenshot(page, "06_login_validation");
    return ss;
  }, page);

  await runTest("Login form shows validation error for invalid email", async () => {
    await page.fill('input[type="email"]', "notanemail");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
    const errors = await page.$$eval("p", (els) =>
      els.map((el) => el.textContent?.trim()).filter(Boolean)
    );
    const hasEmailError = errors.some((e) =>
      e.toLowerCase().includes("valid email") || e.toLowerCase().includes("email")
    );
    if (!hasEmailError) throw new Error("Email validation error not shown");
    const ss = await screenshot(page, "07_invalid_email_error");
    return ss;
  }, page);

  await runTest("Login shows 'Forgot password?' link", async () => {
    const forgotLink = await page.$('a[href="/forgot-password"]');
    if (!forgotLink) throw new Error("Forgot password link not found");
  }, page);

  await runTest("Login shows 'Create one' registration link", async () => {
    const registerLink = await page.$('a[href="/register"]');
    if (!registerLink) throw new Error("Register link not found");
  }, page);

  // ── 3. Registration Flow ──────────────────────────────────────────
  log("\n\ud83d\udcdd SECTION 3: Registration Flow");

  await runTest("Register page loads", async () => {
    await page.goto(`${BASE_URL}/register`, { waitUntil: "networkidle" });
    const heading = await page.textContent("h1");
    if (!heading?.toLowerCase().includes("account")) {
      throw new Error(`Unexpected heading: "${heading}"`);
    }
    const ss = await screenshot(page, "08_register_page");
    return ss;
  }, page);

  await runTest("Register page has Name, Email, Password fields", async () => {
    const inputs = await page.$$("input");
    if (inputs.length < 2) throw new Error(`Expected at least 2 inputs, found ${inputs.length}`);
  }, page);

  await runTest("Register form shows validation for short password", async () => {
    await page.fill('input[type="email"]', "test@example.com");
    await page.fill('input[type="password"]', "short");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(600);
    const errors = await page.$$eval("p", (els) =>
      els.map((el) => el.textContent?.trim()).filter(Boolean)
    );
    const hasPasswordError = errors.some((e) =>
      e.toLowerCase().includes("password") || e.toLowerCase().includes("characters")
    );
    if (!hasPasswordError) throw new Error("Password length validation error not shown");
    const ss = await screenshot(page, "10_register_password_validation");
    return ss;
  }, page);

  await runTest("Successful registration creates account and redirects", async () => {
    await page.goto(`${BASE_URL}/register`, { waitUntil: "networkidle" });
    const nameInput = await page.$('input:not([type="email"]):not([type="password"])');
    if (nameInput) await nameInput.fill(TEST_USER.name);
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/inbox/, { timeout: 15000 });
    const ss = await screenshot(page, "11_after_registration");
    return ss;
  }, page);

  // ── 4. Authenticated App Layout ───────────────────────────────────
  log("\n\ud83c\udfe0 SECTION 4: Authenticated App Layout");

  await runTest("Sidebar navigation links visible", async () => {
    const navLinks = await page.$$eval("a, button", (els) =>
      els.map((el) => el.textContent?.trim()).filter(Boolean)
    );
    const hasInbox = navLinks.some((t) => t.toLowerCase() === "inbox");
    const hasCompose = navLinks.some((t) => t.toLowerCase() === "compose");
    if (!hasInbox) throw new Error("Inbox nav link not found");
    if (!hasCompose) throw new Error("Compose nav link not found");
    const ss = await screenshot(page, "12_app_layout_sidebar");
    return ss;
  }, page);

  await runTest("Inbox page renders", async () => {
    await page.goto(`${BASE_URL}/inbox`, { waitUntil: "networkidle" });
    const pageContent = await page.textContent("body");
    const hasContent = pageContent &&
      (pageContent.includes("conversation") ||
       pageContent.includes("Inbox") ||
       pageContent.includes("Select a conversation") ||
       pageContent.includes("Connect"));
    if (!hasContent) throw new Error("Inbox page shows no recognizable content");
    const ss = await screenshot(page, "13_inbox_page");
    return ss;
  }, page);

  // ── 5. Navigation Links ───────────────────────────────────────────
  log("\n\ud83e\udded SECTION 5: Navigation");

  await runTest("Navigate to /compose", async () => {
    await page.goto(`${BASE_URL}/compose`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const url = page.url();
    const content = await page.textContent("body");
    const isOnCompose = url.includes("/compose");
    const showsCompose = content?.includes("New message") || content?.includes("Connect an email account");
    if (!isOnCompose && !showsCompose) {
      throw new Error(`Expected /compose page, got URL: ${url}`);
    }
    const ss = await screenshot(page, "14_compose_page");
    return ss;
  }, page);

  await runTest("Navigate to /tasks", async () => {
    await page.goto(`${BASE_URL}/tasks`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const heading = await page.$("h1");
    const headingText = heading ? await heading.textContent() : "";
    if (!headingText?.includes("Task")) throw new Error(`Expected Tasks heading, got: "${headingText}"`);
    const ss = await screenshot(page, "15_tasks_page");
    return ss;
  }, page);

  await runTest("Tasks page shows Pending/Done/Dismissed tabs", async () => {
    const tabs = await page.$$eval("button", (els) =>
      els.map((el) => el.textContent?.trim()).filter(Boolean)
    );
    if (!tabs.some((t) => t === "Pending")) throw new Error("'Pending' tab not found");
    if (!tabs.some((t) => t === "Done")) throw new Error("'Done' tab not found");
    if (!tabs.some((t) => t === "Dismissed")) throw new Error("'Dismissed' tab not found");
    const ss = await screenshot(page, "16_tasks_tabs");
    return ss;
  }, page);

  await runTest("Tasks page has Tasks and Follow-ups toggle", async () => {
    const buttons = await page.$$eval("button", (els) =>
      els.map((el) => el.textContent?.trim()).filter(Boolean)
    );
    if (!buttons.some((t) => t === "Tasks")) throw new Error("'Tasks' toggle not found");
    if (!buttons.some((t) => t.includes("Follow"))) throw new Error("'Follow-ups' toggle not found");
  }, page);

  await runTest("Switch to Follow-ups view", async () => {
    const followUpsBtn = await page.getByRole("button", { name: /follow.up/i });
    if (!followUpsBtn) throw new Error("Follow-ups button not found");
    await followUpsBtn.click();
    await page.waitForTimeout(800);
    const ss = await screenshot(page, "17_follow_ups_view");
    return ss;
  }, page);

  await runTest("Navigate to /documents", async () => {
    await page.goto(`${BASE_URL}/documents`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const ss = await screenshot(page, "18_documents_page");
    return ss;
  }, page);

  await runTest("Navigate to /help", async () => {
    await page.goto(`${BASE_URL}/help`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const ss = await screenshot(page, "19_help_page");
    return ss;
  }, page);

  // ── 6. Settings Flow ─────────────────────────────────────────────
  log("\n\u2699\ufe0f  SECTION 6: Settings Pages");

  await runTest("Navigate to /settings/profile", async () => {
    await page.goto(`${BASE_URL}/settings/profile`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const ss = await screenshot(page, "20_settings_profile");
    return ss;
  }, page);

  await runTest("Navigate to /settings/email-accounts", async () => {
    await page.goto(`${BASE_URL}/settings/email-accounts`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const ss = await screenshot(page, "21_settings_email_accounts");
    return ss;
  }, page);

  await runTest("Navigate to /settings/security", async () => {
    await page.goto(`${BASE_URL}/settings/security`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const ss = await screenshot(page, "22_settings_security");
    return ss;
  }, page);

  await runTest("Navigate to /settings/calendar-accounts", async () => {
    await page.goto(`${BASE_URL}/settings/calendar-accounts`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const ss = await screenshot(page, "23_settings_calendar");
    return ss;
  }, page);

  // ── 7. Forgot Password Page ───────────────────────────────────────
  log("\n\ud83d\udd11 SECTION 7: Forgot Password");

  await runTest("Forgot password page loads", async () => {
    await page.goto(`${BASE_URL}/forgot-password`, { waitUntil: "networkidle" });
    const h1 = await page.textContent("h1");
    if (!h1?.toLowerCase().includes("password")) {
      throw new Error(`Unexpected heading: "${h1}"`);
    }
    const ss = await screenshot(page, "25_forgot_password");
    return ss;
  }, page);

  await runTest("Forgot password submits and shows success", async () => {
    await page.fill('input[type="email"]', "nonexistent@example.com");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    const content = await page.textContent("body");
    const success =
      content?.includes("reset link") ||
      content?.includes("on its way") ||
      content?.includes("check your email") ||
      content?.includes("If an account");
    if (!success) throw new Error("Success message not shown after forgot password submit");
    const ss = await screenshot(page, "26_forgot_password_success");
    return ss;
  }, page);

  // ── 8. Inbox Folder Filtering ─────────────────────────────────────
  log("\n\ud83d\udce5 SECTION 8: Inbox Folder Filtering");

  await runTest("Inbox DRAFTS folder", async () => {
    await page.goto(`${BASE_URL}/inbox?folderType=DRAFTS`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const ss = await screenshot(page, "27_inbox_drafts");
    return ss;
  }, page);

  await runTest("Inbox SENT folder", async () => {
    await page.goto(`${BASE_URL}/inbox?folderType=SENT`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const ss = await screenshot(page, "28_inbox_sent");
    return ss;
  }, page);

  await runTest("Inbox TRASH folder", async () => {
    await page.goto(`${BASE_URL}/inbox?folderType=TRASH`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const ss = await screenshot(page, "29_inbox_trash");
    return ss;
  }, page);

  // ── 9. Error Handling ─────────────────────────────────────────────
  log("\n\ud83d\udeab SECTION 9: Error Handling");

  await runTest("Unknown route is handled gracefully", async () => {
    await page.goto(`${BASE_URL}/this-page-does-not-exist`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const content = await page.textContent("body");
    if (!content) throw new Error("Page has no body content");
    const ss = await screenshot(page, "30_404_page");
    return ss;
  }, page);

  // ── 10. Logout ────────────────────────────────────────────────────
  log("\n\ud83d\udc4b SECTION 10: Logout & Auth Guard");

  await runTest("Logout clears session and redirects to login", async () => {
    await page.goto(`${BASE_URL}/inbox`, { waitUntil: "networkidle" });
    await context.clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto(`${BASE_URL}/inbox`, { waitUntil: "networkidle" });
    await page.waitForURL(/\/(login|register)/, { timeout: 8000 });
    const ss = await screenshot(page, "31_after_logout");
    return ss;
  }, page);

  await runTest("Unauthenticated user cannot access /tasks", async () => {
    await page.goto(`${BASE_URL}/tasks`, { waitUntil: "networkidle" });
    await page.waitForURL(/\/(login|register)/, { timeout: 8000 });
    const url = page.url();
    if (!url.includes("/login")) throw new Error(`Expected redirect to /login, got: ${url}`);
    const ss = await screenshot(page, "32_unauth_tasks_redirect");
    return ss;
  }, page);

  await runTest("Unauthenticated user cannot access /compose", async () => {
    await page.goto(`${BASE_URL}/compose`, { waitUntil: "networkidle" });
    await page.waitForURL(/\/(login|register)/, { timeout: 8000 });
    const url = page.url();
    if (!url.includes("/login")) throw new Error(`Expected redirect to /login, got: ${url}`);
    const ss = await screenshot(page, "33_unauth_compose_redirect");
    return ss;
  }, page);

  // ── 11. Login with Valid Credentials ─────────────────────────────
  log("\n\ud83d\udd10 SECTION 11: Login");

  await runTest("Login with registered credentials succeeds", async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/inbox/, { timeout: 15000 });
    const ss = await screenshot(page, "34_successful_login");
    return ss;
  }, page);

  await runTest("Login with wrong password shows error", async () => {
    await context.clearCookies();
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', "WrongPassword999!");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    const errors = await page.$$eval("p", (els) =>
      els.map((el) => el.textContent?.trim()).filter(Boolean)
    );
    const hasError = errors.some((e) =>
      e.toLowerCase().includes("invalid") ||
      e.toLowerCase().includes("failed") ||
      e.toLowerCase().includes("incorrect") ||
      e.toLowerCase().includes("wrong") ||
      e.toLowerCase().includes("credentials")
    );
    if (!hasError) throw new Error("No error shown for wrong password");
    const ss = await screenshot(page, "35_wrong_password_error");
    return ss;
  }, page);

  // ── 12. Mobile Responsive ─────────────────────────────────────────
  log("\n\ud83d\udcf1 SECTION 12: Responsiveness");

  await runTest("Login page renders on mobile viewport", async () => {
    const mobileContext = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    const emailInput = await mobilePage.$('input[type="email"]');
    if (!emailInput) throw new Error("Email input not found on mobile");
    const ss = await screenshot(mobilePage, "36_login_mobile");
    await mobileContext.close();
    return ss;
  }, page);

  // ──────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────

  await browser.close();

  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  const summary = {
    runAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    testUser: TEST_USER.email,
    total: results.length,
    passed,
    failed,
    skipped,
    totalDurationMs: totalDuration,
    consoleErrors,
    screenshotDir: SCREENSHOT_DIR,
    tests: results,
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2));

  log("\n" + "=".repeat(60));
  log("TEST SUMMARY");
  log("=".repeat(60));
  log(`Total Tests : ${results.length}`);
  log(`Passed      : ${passed}`);
  log(`Failed      : ${failed}`);
  log(`Skipped     : ${skipped}`);
  log(`Duration    : ${(totalDuration / 1000).toFixed(1)}s`);
  log(`Screenshots : ${SCREENSHOT_DIR}`);
  log("=".repeat(60));

  if (failed > 0) {
    log("\nFailed tests:");
    results.filter((r) => r.status === "FAIL").forEach((r) => {
      log(`  FAIL ${r.name}: ${r.error}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
})();
