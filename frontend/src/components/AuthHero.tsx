import { Check } from "lucide-react";

function AuthHero() {
  return (
    <div className="relative hidden min-w-0 overflow-hidden lg:flex lg:w-1/2">
      <div
        className="pointer-events-none absolute -right-48 -top-20 size-[520px] rounded-full bg-cyan-500/8 blur-[110px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-24 size-80 rounded-full bg-blue-500/8 blur-[100px]"
        aria-hidden="true"
      />
      <div className="relative z-10 flex w-full flex-col justify-center px-10 py-14 xl:px-14">
        <div className="mb-10 space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5">
            <div
              className="size-1.5 shrink-0 animate-pulse rounded-full bg-cyan-400"
              aria-hidden="true"
            />
            <span className="text-xs font-medium tracking-wide text-cyan-300">
              TRUSTED BY 50,000+ USERS
            </span>
          </div>

          <h2 className="max-w-lg text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">
            Connect with your team, anywhere
          </h2>

          <p className="max-w-md text-base leading-relaxed text-slate-400 xl:text-lg">
            Experience seamless communication with enterprise-grade security and
            reliability.
          </p>
        </div>

        <div className="mb-10 space-y-5">
          <div className="flex items-start gap-3 group">
            <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 transition-colors group-hover:bg-cyan-500/20">
              <Check className="size-3.5 text-cyan-400" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-white font-medium mb-1">
                End-to-end encryption
              </h3>
              <p className="text-sm text-slate-400">
                Your conversations stay private and secure
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 group">
            <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 transition-colors group-hover:bg-cyan-500/20">
              <Check className="size-3.5 text-cyan-400" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-white font-medium mb-1">
                Real-time collaboration
              </h3>
              <p className="text-sm text-slate-400">
                Work together seamlessly across teams
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 group">
            <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 transition-colors group-hover:bg-cyan-500/20">
              <Check className="size-3.5 text-cyan-400" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-white font-medium mb-1">
                99.9% uptime guarantee
              </h3>
              <p className="text-sm text-slate-400">
                Always available when you need it
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 border-t border-slate-600/25 pt-7">
          <div>
            <div className="mb-1 text-2xl font-semibold tracking-tight text-white xl:text-3xl">
              50K+
            </div>
            <div className="text-xs text-slate-400 xl:text-sm">
              Active users
            </div>
          </div>

          <div>
            <div className="mb-1 text-2xl font-semibold tracking-tight text-white xl:text-3xl">
              99.9%
            </div>
            <div className="text-xs text-slate-400 xl:text-sm">Uptime</div>
          </div>

          <div>
            <div className="mb-1 text-2xl font-semibold tracking-tight text-white xl:text-3xl">
              4.9★
            </div>
            <div className="text-xs text-slate-400 xl:text-sm">User rating</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthHero;
