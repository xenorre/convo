import { Outlet } from "react-router";

function RootLayout() {
  return (
    <div className="app-shell relative isolate flex items-center justify-center bg-slate-950">
      <div
        aria-hidden="true"
        className="app-ambience pointer-events-none absolute inset-0 -z-10"
      />
      <main className="relative flex w-full min-w-0 items-center justify-center">
        <Outlet />
      </main>
    </div>
  );
}

export default RootLayout;
