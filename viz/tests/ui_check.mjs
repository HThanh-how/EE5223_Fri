// Headless-browser check (needs: npm i playwright-core, a Chromium; serve dist on :8099 first)
//   (cd web/dist && python3 -m http.server 8099 &) ; CHROMIUM=/usr/bin/chromium node tests/ui_check.mjs [outdir]
import { chromium } from "playwright-core";
const out = process.argv[2] ?? ".";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
await p.goto("http://localhost:8099/", { waitUntil: "networkidle" });
await p.waitForSelector("svg");
const badge = () => p.getAttribute("[data-testid=match-badge]", "data-match");
const toEnd = async () => { for (let i = 0; i < 30; i++) { const nx = p.locator('button[aria-label="Step forward"]'); if (await nx.isDisabled()) break; await nx.click(); } };
let ok = true; const expect = (c, m) => { if (!c) { ok = false; console.log("FAIL", m); } else console.log("ok  ", m); };
expect((await badge()) === "pending", "badge pending at cycle 0");
for (let i = 0; i < 7; i++) await p.click('button[aria-label="Step forward"]');
await p.screenshot({ path: `${out}/mid_animation.png`, fullPage: true });
await toEnd();
expect((await badge()) === "true", "default example: RTL matches reference at the end");
// user-entered numbers: random matrices, 6 rows of A
await p.click("summary");
await p.selectOption("select", "6");
await p.click("text=Random numbers");
await p.click("text=Run on the RTL");
await p.waitForTimeout(600);
await p.click('button[aria-label="Pause"]').catch(() => {});
await toEnd();
expect((await badge()) === "true", "random 6x4 matrices: RTL matches reference");
expect((await p.locator("svg").count()) >= 1, "svg present");
expect(errs.length === 0, "no console/page errors " + errs.join("|"));
await b.close();
console.log(ok ? "UI CHECK PASSED" : "UI CHECK FAILED"); process.exit(ok ? 0 : 1);
