import arcjet, { shield, detectBot, slidingWindow } from "@arcjet/node";

const aj = arcjet({
  key: process.env.ARCJET_KEY,
  rules: [
    shield({ mode: "LIVE" }),
    detectBot({
      mode: "LIVE",
      allow: [
        "CATEGORY:SEARCH_ENGINE", // Google, Bing, etc
        "CATEGORY:PREVIEW", // Facebook, Slack, etc - link previews
      ],
    }),
    slidingWindow({
      mode: "LIVE",
      interval: "2s",
      max: 5,
    }),
  ],
});

export default aj;
