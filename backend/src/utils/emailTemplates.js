// Emails are built for the lowest common denominator of mail clients:
// tables for layout, inline styles only (Gmail and Outlook drop or rewrite
// <style> blocks), no flexbox, no images, and a solid colour behind every
// gradient. Each template returns { subject, html, text }; the plain-text
// part helps spam filters and text-only clients.

// Names are typed by users; in an email's HTML they must stay plain text.
export const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// #0e7490 keeps white button text above WCAG AA contrast (about 5.4:1).
const BRAND = "#0e7490";
const TEXT = "#0f172a";
const BODY = "#334155";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const PAGE = "#f1f5f9";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

// "Ann" from "Ann Smith"; names are free text, so fall back politely.
export const firstName = (fullName) => String(fullName ?? "").trim().split(/\s+/)[0] || "there";

// Inbox preview text. The padding of invisible characters stops clients from
// pulling the email's first lines in after it.
const preheader = (text) =>
  `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${PAGE};">${escapeHtml(text)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>`;

// A table-cell button: the coloured cell renders even where padding on links
// is ignored (Outlook for Windows).
const button = (href, label) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
  <tr>
    <td align="center" bgcolor="${BRAND}" style="border-radius:10px;background:${BRAND};">
      <a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 32px;font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;

const paragraph = (html, { size = 16, color = BODY, margin = "0 0 16px", align = "left" } = {}) =>
  `<p style="margin:${margin};font-family:${FONT};font-size:${size}px;line-height:1.6;color:${color};text-align:${align};">${html}</p>`;

// The shared frame: logo, white card, footer saying why the email came.
const layout = ({ title, preview, content, reason }) => `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;width:100%;background:${PAGE};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    ${preheader(preview)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE};">
      <tr>
        <td align="center" style="padding:32px 12px;">
          <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
            <tr>
              <td style="padding:0 4px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="36" height="36" align="center" valign="middle" bgcolor="#0891b2" style="width:36px;height:36px;border-radius:10px;background:#0891b2;background-image:linear-gradient(135deg,#06b6d4,#2563eb);font-family:${FONT};font-size:19px;font-weight:700;line-height:36px;color:#ffffff;">C</td>
                    <td style="padding-left:10px;font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:-0.3px;color:${TEXT};">Convo</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;padding:36px 32px;">
                ${content}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 8px 0;">
                ${paragraph(reason, { size: 12, color: MUTED, margin: "0 0 8px" })}
                ${paragraph(`&copy; ${new Date().getFullYear()} Convo`, { size: 12, color: MUTED, margin: "0" })}
              </td>
            </tr>
          </table>
          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>
  </body>
</html>`;

const heading = (text) =>
  `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;font-weight:700;line-height:1.3;letter-spacing:-0.3px;color:${TEXT};">${text}</h1>`;

// For when the button can't be clicked: the address itself, breakable so it
// doesn't widen the email on phones.
const linkFallback = (link) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;border-top:1px solid ${LINE};">
  <tr>
    <td style="padding-top:20px;">
      ${paragraph("If the button doesn't work, copy this link into your browser:", { size: 13, color: MUTED, margin: "0 0 6px" })}
      ${paragraph(`<a href="${escapeHtml(link)}" target="_blank" rel="noopener" style="color:${BRAND};text-decoration:underline;word-break:break-all;">${escapeHtml(link)}</a>`, { size: 13, color: BRAND, margin: "0" })}
    </td>
  </tr>
</table>`;

const reasonFor = (email, why = "it was used to sign up for Convo") =>
  `This email was sent to ${escapeHtml(email)} because ${why}.`;

const ACCOUNT_REASON = "it belongs to a Convo account";

// "1 hour", "24 hours", "30 minutes".
const duration = (minutes) => {
  const [value, unit] = minutes % 60 === 0 ? [minutes / 60, "hour"] : [minutes, "minute"];
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
};

export function createVerificationEmail({ name, email, link, expiresInHours }) {
  const hi = escapeHtml(firstName(name));
  const expiry = `${expiresInHours} hours`;
  const subject = "Confirm your email for Convo";

  const html = layout({
    title: subject,
    preview: `Confirm your email to finish creating your Convo account. The link expires in ${expiry}.`,
    reason: reasonFor(email),
    content: `
      ${heading("Confirm your email")}
      ${paragraph(`Hi ${hi},`)}
      ${paragraph(`Thanks for signing up for Convo. Confirm that <strong style="color:${TEXT};">${escapeHtml(email)}</strong> is your address and you'll be signed in straight away.`, { margin: "0 0 28px" })}
      ${button(link, "Confirm email")}
      ${paragraph(`The link expires in ${expiry} and works once.`, { size: 14, color: MUTED, margin: "20px 0 0", align: "center" })}
      ${paragraph("Didn't sign up? You can safely ignore this email. Nobody can use the account without this link.", { size: 14, color: MUTED, margin: "20px 0 0" })}
      ${linkFallback(link)}`,
  });

  const text = [
    `Hi ${firstName(name)},`,
    "",
    `Thanks for signing up for Convo. Confirm that ${email} is your address by opening this link:`,
    "",
    link,
    "",
    `The link expires in ${expiry} and works once.`,
    "",
    "Didn't sign up? You can safely ignore this email. Nobody can use the account without this link.",
    "",
    "— Convo",
  ].join("\n");

  return { subject, html, text };
}

const STEPS = [
  ["Add a profile photo", "so friends recognise you."],
  ["Find your friends", "by searching for their name and sending a request."],
  ["Start a conversation", "with messages, photos and files."],
];

export function createWelcomeEmail({ name, email, appUrl }) {
  const hi = escapeHtml(firstName(name));
  const subject = "Welcome to Convo";

  const steps = STEPS.map(
    ([title, detail], index) => `
      <tr>
        <td width="28" valign="top" style="padding:0 12px 14px 0;">
          <div style="width:28px;height:28px;border-radius:14px;background:#ecfeff;font-family:${FONT};font-size:13px;font-weight:700;line-height:28px;text-align:center;color:${BRAND};">${index + 1}</div>
        </td>
        <td valign="top" style="padding:3px 0 14px;font-family:${FONT};font-size:15px;line-height:1.5;color:${BODY};">
          <strong style="color:${TEXT};">${title}</strong> ${detail}
        </td>
      </tr>`
  ).join("");

  const html = layout({
    title: subject,
    preview: "Your account is ready. Here's how to get started.",
    reason: reasonFor(email),
    content: `
      ${heading(`Welcome to Convo, ${hi}`)}
      ${paragraph("Your email is confirmed and your account is ready. A few things to try first:", { margin: "0 0 24px" })}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">${steps}
      </table>
      ${button(appUrl, "Open Convo")}`,
  });

  const text = [
    `Hi ${firstName(name)},`,
    "",
    "Your email is confirmed and your account is ready. A few things to try first:",
    "",
    ...STEPS.map(([title, detail], index) => `${index + 1}. ${title} ${detail}`),
    "",
    `Open Convo: ${appUrl}`,
    "",
    "— Convo",
  ].join("\n");

  return { subject, html, text };
}

export function createPasswordResetEmail({ name, email, link, expiresInMinutes }) {
  const hi = escapeHtml(firstName(name));
  const expiry = duration(expiresInMinutes);
  const subject = "Reset your Convo password";

  const html = layout({
    title: subject,
    preview: `Choose a new password for your Convo account. The link expires in ${expiry}.`,
    reason: reasonFor(email, ACCOUNT_REASON),
    content: `
      ${heading("Reset your password")}
      ${paragraph(`Hi ${hi},`)}
      ${paragraph(`Someone asked to reset the password for <strong style="color:${TEXT};">${escapeHtml(email)}</strong>. If it was you, choose a new password and you'll be signed in straight away.`, { margin: "0 0 28px" })}
      ${button(link, "Choose a new password")}
      ${paragraph(`The link expires in ${expiry} and works once.`, { size: 14, color: MUTED, margin: "20px 0 0", align: "center" })}
      ${paragraph("Didn't ask for this? You can safely ignore this email. Your password won't change unless this link is used.", { size: 14, color: MUTED, margin: "20px 0 0" })}
      ${linkFallback(link)}`,
  });

  const text = [
    `Hi ${firstName(name)},`,
    "",
    `Someone asked to reset the password for ${email}. If it was you, choose a new password here:`,
    "",
    link,
    "",
    `The link expires in ${expiry} and works once.`,
    "",
    "Didn't ask for this? You can safely ignore this email. Your password won't change unless this link is used.",
    "",
    "— Convo",
  ].join("\n");

  return { subject, html, text };
}

const changeTime = (date) =>
  `${new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(date)} UTC`;

// A notice only, with nothing to click: a real one can't be told apart from
// a phishing copy by its button, so it sends people to the app themselves.
export function createPasswordChangedEmail({ name, email, changedAt }) {
  const hi = escapeHtml(firstName(name));
  const when = changeTime(changedAt);
  const subject = "Your Convo password was changed";
  const notYou =
    "If you didn't do this, open Convo yourself, choose \"Forgot password?\" on the sign-in page and reset it straight away. Every other device was already signed out.";

  const html = layout({
    title: subject,
    preview: `The password for your Convo account was changed on ${when}.`,
    reason: reasonFor(email, ACCOUNT_REASON),
    content: `
      ${heading("Your password was changed")}
      ${paragraph(`Hi ${hi},`)}
      ${paragraph(`The password for <strong style="color:${TEXT};">${escapeHtml(email)}</strong> was changed on ${escapeHtml(when)}. If that was you, there's nothing else to do.`)}
      ${paragraph(escapeHtml(notYou), { margin: "0" })}`,
  });

  const text = [
    `Hi ${firstName(name)},`,
    "",
    `The password for ${email} was changed on ${when}. If that was you, there's nothing else to do.`,
    "",
    notYou,
    "",
    "— Convo",
  ].join("\n");

  return { subject, html, text };
}

// Sent to the address the account had, after everything else is gone.
export function createAccountDeletedEmail({ name, email, deletedAt }) {
  const hi = escapeHtml(firstName(name));
  const when = changeTime(deletedAt);
  const subject = "Your Convo account was deleted";
  const what =
    "Your profile, photo, friends, settings and the files you sent are gone. Messages you sent stay in the other person's conversation, shown as from \"Deleted account\".";
  const notYou =
    "If you didn't do this, someone else knew your password. You can sign up again with this email at any time.";

  const html = layout({
    title: subject,
    preview: `Your Convo account was deleted on ${when}.`,
    reason: reasonFor(email, "it belonged to a Convo account"),
    content: `
      ${heading("Your account was deleted")}
      ${paragraph(`Hi ${hi},`)}
      ${paragraph(`The Convo account for <strong style="color:${TEXT};">${escapeHtml(email)}</strong> was deleted on ${escapeHtml(when)}.`)}
      ${paragraph(escapeHtml(what))}
      ${paragraph(escapeHtml(notYou), { margin: "0" })}`,
  });

  const text = [
    `Hi ${firstName(name)},`,
    "",
    `The Convo account for ${email} was deleted on ${when}.`,
    "",
    what,
    "",
    notYou,
    "",
    "— Convo",
  ].join("\n");

  return { subject, html, text };
}
