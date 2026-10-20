import { Outlet } from "react-router";

function RootLayout() {
  return (
    <div className="app-shell relative isolate flex items-center justify-center bg-slate-950">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#94a3b80a_1px,transparent_1px),linear-gradient(to_bottom,#94a3b80a_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="absolute -top-40 -left-40 size-96 rounded-full bg-pink-500/10 blur-[100px]" />
        <div className="absolute -right-40 -bottom-40 size-96 rounded-full bg-cyan-500/15 blur-[100px]" />
      </div>
      <main className="relative flex w-full min-w-0 items-center justify-center">
        <Outlet />
      </main>
    </div>
  );
}

export default RootLayout;
