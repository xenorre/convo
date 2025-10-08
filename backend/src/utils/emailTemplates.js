export function createWelcomeEmailTemplate(name, clientUrl) {
  return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width,initial-scale=1" />
            <title>Convo — Welcome</title>
            <style>
            html,
            body {
                margin: 0;
                padding: 0;
                height: 100%;
            }
            img {
                border: 0;
                line-height: 100%;
                outline: none;
                text-decoration: none;
                -ms-interpolation-mode: bicubic;
            }
            a {
                color: inherit;
                text-decoration: none;
            }
            .email-wrap {
                background-color: #f5f7fb;
                padding: 40px 16px;
            }
            .email-body {
                max-width: 680px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 12px;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                "Helvetica Neue", Arial;
                color: #111827;
            }
            .content {
                padding: 28px;
            }
            .brand {
                display: flex;
                align-items: center;
                gap: 14px;
            }
            .brand-logo {
                width: 56px;
                height: 56px;
                border-radius: 12px;
                background: linear-gradient(135deg, #6ee7b7, #3b82f6);
                display: inline-block;
                flex: 0 0 56px;
            }
            .brand-title {
                font-size: 20px;
                font-weight: 700;
            }
            .brand-sub {
                font-size: 13px;
                color: #6b7280;
            }
            .hero {
                padding: 10px 28px 0;
            }
            .greeting {
                font-size: 18px;
                font-weight: 600;
                margin: 14px 0;
            }
            .lead {
                font-size: 15px;
                line-height: 1.5;
                color: #374151;
            }
            .steps {
                margin: 22px 0;
                padding-left: 20px;
                font-size: 14px;
                color: #374151;
            }
            .steps li {
                margin-bottom: 8px;
            }
            .cta {
                margin: 22px 0;
                text-align: center;
            }
            .btn {
                display: inline-block;
                padding: 14px 22px;
                border-radius: 10px;
                background: linear-gradient(90deg, #4f46e5, #06b6d4);
                color: #fff;
                font-weight: 700;
            }
            .foot {
                padding: 20px 28px;
                background: #fbfdff;
                border-top: 1px solid #eef2ff;
                font-size: 13px;
                color: #6b7280;
            }
            .muted {
                color: #9ca3af;
                font-size: 13px;
            }
            .socials {
                display: flex;
                gap: 8px;
                margin-top: 10px;
            }
            @media screen and (max-width: 480px) {
                .email-body {
                border-radius: 8px;
                }
                .content {
                padding: 18px;
                }
                .brand-title {
                font-size: 18px;
                }
                .greeting {
                font-size: 16px;
                }
                .btn {
                width: 100%;
                text-align: center;
                display: block;
                }
            }
            </style>
        </head>
        <body style="background: #f5f7fb">
            <center class="email-wrap">
            <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="max-width: 680px; margin: 0 auto"
            >
                <tr>
                <td>
                    <table
                    role="presentation"
                    class="email-body"
                    width="100%"
                    cellpadding="0"
                    cellspacing="0"
                    border="0"
                    >
                    <tr>
                        <td
                        style="
                            padding: 20px 28px;
                            background: linear-gradient(180deg, #ffffff, #fbfdff);
                        "
                        >
                        <div class="brand">
                            <div class="brand-logo" aria-hidden="true"></div>
                            <div>
                            <div class="brand-title">Convo</div>
                            <div class="brand-sub">Beautiful, secure messaging</div>
                            </div>
                        </div>
                        </td>
                    </tr>

                    <tr>
                        <td class="content">
                        <div class="hero">
                            <div class="greeting">Welcome, ${name} 👋</div>
                            <div class="lead">
                            We're excited to have you onboard at
                            <strong>Convo</strong>. Let's get you started in just a
                            few simple steps:
                            </div>
                            <ul class="steps">
                            <li>Set up your profile picture</li>
                            <li>Add your friends or colleagues to your contacts</li>
                            <li>Say hello 👋</li>
                            <li>Try out sharing files, emojis, and more</li>
                            </ul>

                            <div class="cta">
                            <a
                                class="btn"
                                href=${clientUrl}
                                target="_blank"
                                rel="noopener"
                                >Open Convo</a
                            >
                            </div>

                            <div
                            style="margin-top: 8px; font-size: 13px; color: #6b7280"
                            >
                            Need a hand? Just reply to this email or comment in the
                            Help section of the app — we’re here to support you.
                            </div>
                        </div>
                        </td>
                    </tr>

                    <tr>
                        <td class="foot">
                        <div
                            style="
                            display: flex;
                            flex-wrap: wrap;
                            align-items: center;
                            justify-content: space-between;
                            gap: 12px;
                            "
                        >
                            <div style="max-width: 70%">
                            <div style="font-weight: 600; color: #111827">Convo</div>
                            <div class="muted">
                                Made with ❤️ · Secure end-to-end encryption
                            </div>
                            </div>
                            <div style="text-align: right">
                            <div style="font-size: 13px; color: #6b7280">
                                Follow us
                            </div>
                            <div class="socials" style="justify-content: flex-end">
                                <a href="{{twitter_url}}" aria-label="Twitter"
                                >Twitter</a
                                >
                                <span style="color: #d1d5db">·</span>
                                <a href="#" aria-label="Help Center">Help Center</a>
                            </div>
                            </div>
                        </div>
                        <div
                            style="margin-top: 12px; font-size: 12px; color: #9ca3af"
                        >
                            If you didn’t sign up for a Convo account, please ignore
                            this email or contact us at
                            <a href="mailto:support@convo.com">support@convo.com</a>.
                        </div>
                        <div
                            style="margin-top: 10px; font-size: 12px; color: #9ca3af"
                        >
                            © 2025 Convo. All rights reserved.
                        </div>
                        </td>
                    </tr>
                    </table>
                </td>
                </tr>
            </table>
            </center>
        </body>
        </html>
    `;
}
