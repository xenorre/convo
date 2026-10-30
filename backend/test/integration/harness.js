// Runs the real app over HTTP against a real, throwaway MongoDB (the same
// version as the Docker images, see "config" in package.json). Each test
// file runs in its own process, so each gets its own database and its own
// in-memory rate limits. Nothing reaches the developer's database, Resend or
// any outside service.
import { MongoMemoryServer } from "mongodb-memory-server";

const CLIENT_URL = "http://convo.test";

export const startApp = async () => {
  const mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: mongo.getUri("convo_integration"),
    JWT_SECRET: "integration-test-secret",
    REDIS_URL: "",
    RESEND_API_KEY: "",
    LOG_TO_FILES: "false",
    CLIENT_URL,
    EMAIL_FROM: "",
    EMAIL_FROM_NAME: "",
  });

  // The breached-password check would call api.pwnedpasswords.com.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, options) =>
    String(url).startsWith("https://api.pwnedpasswords.com/")
      ? Promise.resolve(new Response("", { status: 200 }))
      : realFetch(url, options);

  const { default: mongoose } = await import("mongoose");
  const { default: logger } = await import("../../src/config/logger.js");
  logger.silent = true;
  await import("../../src/app.js");
  const { server, io } = await import("../../src/config/socket.js");
  const { resendClient } = await import("../../src/config/resend.js");

  // Every email is kept here instead of being sent.
  const emails = [];
  resendClient.emails.send = async (payload) => {
    emails.push(payload);
    return { data: { id: `email-${emails.length}` }, error: null };
  };

  await mongoose.connect(process.env.DATABASE_URL);
  // Unique indexes must exist before the tests rely on them.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    base,
    emails,
    mongoose,
    client: () => createClient(base),
    // The newest email to `to` and the token in its link.
    lastEmailTo(to) {
      const email = emails.findLast((sent) => sent.to === to);
      if (!email) throw new Error(`No email was sent to ${to}`);
      return { ...email, token: email.text.match(/token=([\w-]+)/)?.[1] };
    },
    async stop() {
      globalThis.fetch = realFetch;
      // Also closes the HTTP server it is attached to.
      await new Promise((resolve) => io.close(resolve));
      await mongoose.disconnect();
      await mongo.stop();
    },
  };
};

// A browser in miniature: keeps cookies, sends the CSRF token like the
// frontend does, and parses JSON answers.
const createClient = (base) => {
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  const keepCookies = (response) => {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair, ...attributes] = cookie.split(";");
      const [name, ...rest] = pair.split("=");
      const value = rest.join("=");
      const expired = !value || attributes.some((attribute) => /expires=thu, 01 jan 1970/i.test(attribute));
      if (expired) jar.delete(name.trim());
      else jar.set(name.trim(), value);
    }
  };

  const request = async (method, path, body) => {
    if (!jar.has("csrfToken")) keepCookies(await fetch(`${base}/csrf-token`));
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        cookie: cookieHeader(),
        origin: CLIENT_URL,
        "x-csrf-token": jar.get("csrfToken"),
        ...(body !== undefined && { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    keepCookies(response);
    const text = await response.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {
      // Not JSON; keep the text.
    }
    return { status: response.status, body: data };
  };

  return {
    get: (path) => request("GET", path),
    post: (path, body = {}) => request("POST", path, body),
    put: (path, body = {}) => request("PUT", path, body),
    patch: (path, body = {}) => request("PATCH", path, body),
    delete: (path, body) => request("DELETE", path, body),
    hasSession: () => jar.has("token"),
  };
};

export const PASSWORD = "copper-lantern-meadow-58";

// Signs up and opens the confirmation link, like a new user would.
// Returns a signed-in client and the account.
export const createUser = async (app, { fullName, email, password = PASSWORD }) => {
  const client = app.client();
  const signUp = await client.post("/api/v1/auth/sign-up", { fullName, email, password });
  if (signUp.status !== 201) throw new Error(`Sign-up failed: ${JSON.stringify(signUp.body)}`);
  const confirm = await client.post("/api/v1/auth/verify-email", { token: app.lastEmailTo(email).token });
  if (confirm.status !== 200) throw new Error(`Confirming failed: ${JSON.stringify(confirm.body)}`);
  return { client, user: confirm.body.user, email, password };
};

// Makes two users friends through the friend request flow.
export const befriend = async (a, b) => {
  const sent = await a.client.post("/api/v1/friends/requests", { userId: b.user._id });
  if (sent.status >= 300) throw new Error(`Friend request failed: ${JSON.stringify(sent.body)}`);
  const requestId = sent.body.request?.friendRequestId ?? sent.body.friendRequestId;
  const accepted = await b.client.post(`/api/v1/friends/requests/${requestId}/accept`);
  if (accepted.status >= 300) throw new Error(`Accepting failed: ${JSON.stringify(accepted.body)}`);
};
