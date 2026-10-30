import { create } from 'zustand';
import { announceNewVersion } from '@/utils/newVersionNotice';

export interface ServerBuild {
  version: string;
  commit: string | null;
}

// This tab's own build (see vite.config.ts).
export const APP_BUILD: ServerBuild = { version: __APP_VERSION__, commit: __APP_COMMIT__ || null };

// Another build is running on the server than this tab was loaded from,
// e.g. after a deploy while the tab stayed open. Commits are compared only
// when both sides know theirs (Docker builds); in development they don't.
export const isDifferentBuild = (server: ServerBuild, app: ServerBuild = APP_BUILD) =>
  server.version !== app.version || Boolean(server.commit && app.commit && server.commit !== app.commit);

// The server build last seen on an API answer, for Settings, About.
export const useServerBuild = create<{ build: ServerBuild | null }>(() => ({ build: null }));

let announced = false;

// Reads the X-App-Version / X-App-Commit headers every API answer carries,
// and offers a reload once if the server runs another build.
export function noteServerBuild(headers: Record<string, unknown> | undefined) {
  const version = headers?.['x-app-version'];
  if (typeof version !== 'string' || !version) return;
  const commit = typeof headers?.['x-app-commit'] === 'string' && headers['x-app-commit'] ? headers['x-app-commit'] : null;

  const seen = useServerBuild.getState().build;
  if (seen?.version !== version || seen?.commit !== commit) useServerBuild.setState({ build: { version, commit } });

  if (!announced && isDifferentBuild({ version, commit })) {
    announced = true;
    announceNewVersion();
  }
}

// For tests: forget that the notice was shown.
export const resetServerBuildNotice = () => {
  announced = false;
  useServerBuild.setState({ build: null });
};
