import { Check } from "lucide-react";

// What Convo actually does; no numbers or promises it can't back up.
const FEATURES = [
  {
    title: "Real-time messaging",
    detail: "Messages, photos and files arrive instantly, with typing and read status",
  },
  {
    title: "Privacy you control",
    detail: "Choose who can message you, hide your online status or block anyone",
  },
  {
    title: "Secure accounts",
    detail: "Confirmed email addresses and passwords checked against known data breaches",
  },
];

function AuthHero() {
  return (
    <div className="auth-hero relative hidden min-w-0 overflow-hidden lg:flex lg:w-1/2">
      <div className="relative z-10 flex w-full flex-col justify-center px-10 py-14 xl:px-14">
        <div className="mb-10 space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5">
            <div
              className="size-1.5 shrink-0 animate-pulse rounded-full bg-cyan-400"
              aria-hidden="true"
            />
            <span className="text-xs font-medium tracking-wide text-cyan-300">
              REAL-TIME MESSAGING
            </span>
          </div>

          <h2 className="max-w-lg text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">
            Stay close to the people who matter
          </h2>

          <p className="max-w-md text-base leading-relaxed text-slate-400 xl:text-lg">
            Add your friends and talk one to one, the moment something happens.
          </p>
        </div>

        <ul className="mb-10 space-y-5">
          {FEATURES.map(({ title, detail }) => (
            <li key={title} className="flex items-start gap-3 group">
              <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 transition-colors group-hover:bg-cyan-500/20">
                <Check className="size-3.5 text-cyan-400" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-white font-medium mb-1">{title}</h3>
                <p className="text-sm text-slate-400">{detail}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="border-t border-slate-600/25 pt-7 text-sm leading-relaxed text-slate-400">
          Your data stays yours: download a copy or delete your account at any time.
        </p>
      </div>
    </div>
  );
}

export default AuthHero;
