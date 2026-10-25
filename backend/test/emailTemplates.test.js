import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPasswordChangedEmail,
  createPasswordResetEmail,
  createVerificationEmail,
  createWelcomeEmail,
  firstName,
} from "../src/utils/emailTemplates.js";

const verification = (overrides = {}) =>
  createVerificationEmail({
    name: "Ann Smith",
    email: "ann@example.com",
    link: "https://convo.test/verify-email?token=x&y",
    expiresInHours: 24,
    ...overrides,
  });

const passwordReset = (overrides = {}) =>
  createPasswordResetEmail({
    name: "Ann Smith",
    email: "ann@example.com",
    link: "https://convo.test/reset-password?token=x&y",
    expiresInMinutes: 60,
    ...overrides,
  });

const passwordChanged = (overrides = {}) =>
  createPasswordChangedEmail({
    name: "Ann Smith",
    email: "ann@example.com",
    changedAt: new Date("2026-10-25T14:03:00Z"),
    ...overrides,
  });

const welcome = (overrides = {}) =>
  createWelcomeEmail({ name: "Ann Smith", email: "ann@example.com", appUrl: "https://convo.test", ...overrides });

test("the confirmation email greets by first name and keeps the link usable without the button", () => {
  const { subject, html, text } = verification();
  assert.equal(subject, "Confirm your email for Convo");
  assert.match(html, /Hi Ann,/);
  // Once in the button, once in the fallback link.
  assert.equal(html.split('href="https://convo.test/verify-email?token=x&amp;y"').length - 1, 2);
  assert.match(html, /expires in 24 hours/);
  assert.ok(text.includes("https://convo.test/verify-email?token=x&y"));
  assert.match(text, /^Hi Ann,/);
});

test("anything a user typed is escaped in the HTML", () => {
  const { html } = verification({ name: `<img src=x onerror="alert(1)">`, email: "a<b>@example.com" });
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("a<b>@"));
  for (const email of [welcome, passwordReset, passwordChanged]) {
    const { html } = email({ name: "<script>x</script>", email: "a<b>@example.com" });
    assert.ok(!html.includes("<script>"));
    assert.ok(!html.includes("a<b>@"));
  }
});

test("every email says who it was sent to, with no placeholders or dead links left", () => {
  for (const { html, text } of [verification(), welcome(), passwordReset(), passwordChanged()]) {
    assert.match(html, /sent to ann@example\.com/);
    assert.ok(!/\{\{|\}\}/.test(html), "no template placeholders");
    assert.ok(!html.includes('href="#"'), "no dead links");
    assert.ok(!/<style/i.test(html), "inline styles only");
    assert.match(html, new RegExp(`&copy; ${new Date().getFullYear()} Convo`));
    assert.ok(!/<[a-z]/i.test(text), "the text part has no HTML");
  }
});

test("the welcome email links to the app", () => {
  const { subject, html, text } = welcome();
  assert.equal(subject, "Welcome to Convo");
  assert.match(html, /Welcome to Convo, Ann/);
  assert.ok(html.includes('href="https://convo.test"'));
  assert.ok(text.includes("Open Convo: https://convo.test"));
});

test("a blank name still reads naturally", () => {
  assert.equal(firstName("  Ann   Smith "), "Ann");
  assert.equal(firstName(""), "there");
  assert.equal(firstName(undefined), "there");
});

test("the reset email links to the reset page and says how long it works", () => {
  const { subject, html, text } = passwordReset();
  assert.equal(subject, "Reset your Convo password");
  assert.equal(html.split('href="https://convo.test/reset-password?token=x&amp;y"').length - 1, 2);
  assert.match(html, /expires in 1 hour/);
  assert.ok(text.includes("https://convo.test/reset-password?token=x&y"));
  assert.match(passwordReset({ expiresInMinutes: 30 }).text, /expires in 30 minutes/);
});

test("the password-changed notice says when, and has nothing to click", () => {
  const { subject, html, text } = passwordChanged();
  assert.equal(subject, "Your Convo password was changed");
  assert.match(text, /25 October 2026 at 14:03 UTC/);
  assert.match(text, /Forgot password\?/);
  assert.ok(!/href=/.test(html));
});
