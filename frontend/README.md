# Convo frontend

The React single-page app of Convo. For the whole project (features, backend,
releases) see the [root README](../README.md); for production,
[DEPLOYMENT.md](../DEPLOYMENT.md).

React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Zustand 5 for state,
React Router 8, axios and the Socket.IO client, lucide icons and
react-hot-toast; tested with Vitest and Testing Library.

## Getting started

Needs Node.js 24 and the backend running on http://localhost:3000.

```bash
npm install
npm run dev     # http://localhost:5173
```

Settings come from Vite variables (see [.env.example](.env.example)):

- `VITE_API_URL`: the API's base, without the version (default `http://localhost:3000/api`; the app adds `/v1`)
- `VITE_WS_URL`: the Socket.IO origin (default `http://localhost:3000`)
- `VITE_APP_NAME`, `VITE_MAX_MESSAGE_LENGTH`
- `VITE_LOG_ENDPOINT`, `VITE_METRICS_ENDPOINT`, `VITE_HEALTH_ENDPOINT`: opt-in telemetry; unset sends nothing

In production both URLs default to the page's own origin, since the backend
serves the built app. In development Vite also forwards `/uploads` (uploaded
photos) to the backend.

## Scripts

- `npm run dev`: development server with Fast Refresh
- `npm run build`: type check and production build into `dist/`; `npm run preview` serves it
- `npm run lint` (`lint:fix`): ESLint, including the React Compiler rules of eslint-plugin-react-hooks
- `npm run type-check`: TypeScript only
- `npm test`: Vitest in watch mode; `npm run test:run` once; `npm run test:ui` in the browser
- `npm run format` (`format:check`): Prettier
- `npm run analyze`: build with a bundle size report

## Structure

```
src/
├── main.tsx, App.tsx      # entry and routes
├── *Layout.tsx            # root, signed-out and chat layouts
├── pages/                 # sign-in and account pages, chat, settings/
├── components/            # chat list and window, messages, friends, dialogs
├── store/                 # Zustand: auth, chat, friends, settings
├── services/              # API client, auth session, app version, logging
├── hooks/                 # typing signal, connection status, password strength, ...
├── config/env.ts          # Vite variables with defaults
├── utils/                 # validation, avatars, uploads, errors
├── types/                 # API types
└── test/                  # Vitest setup
```

Tests live next to the code in `__tests__/` folders.

## How it talks to the backend

- [services/apiService.ts](src/services/apiService.ts) sends every request
  with the session cookie and the CSRF token, against `/api/v1`, and notices
  when the server runs a newer build (Settings › About, and a reload prompt).
- The app keeps one Socket.IO connection for new messages, read
  receipts, typing and presence, and reloads conversations over HTTP after a
  reconnect.
- A session ended elsewhere (signed in on another device, account deleted)
  signs the tab out with an explanation.

## Docker

[Dockerfile](Dockerfile) and [nginx.conf](nginx.conf) build a standalone
image (static files behind Nginx), used by `docker-compose.fullstack.yml` in
the root. Production instead builds the app into the root image, served by
the backend.

## License

ISC
