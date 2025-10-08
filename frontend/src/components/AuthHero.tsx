import { Check } from "lucide-react";

function AuthHero() {
  return (
    <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-[150px]" />
      <div className="relative z-10 flex flex-col justify-center w-full px-20 py-20">
        <div className="space-y-6 mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-xs font-medium text-blue-300 tracking-wide">
              TRUSTED BY 50,000+ USERS
            </span>
          </div>

          <h2 className="text-4xl font-semibold text-white leading-tight tracking-tight max-w-lg">
            Connect with your team, anywhere
          </h2>

          <p className="text-lg text-slate-400 leading-relaxed max-w-md">
            Experience seamless communication with enterprise-grade security and
            reliability.
          </p>
        </div>

        <div className="space-y-4 mb-16">
          <div className="flex items-start gap-3 group">
            <div className="w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center mt-0.5 group-hover:bg-blue-500/20 transition-colors">
              <Check className="w-3 h-3 text-blue-400" />
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
            <div className="w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center mt-0.5 group-hover:bg-blue-500/20 transition-colors">
              <Check className="w-3 h-3 text-blue-400" />
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
            <div className="w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center mt-0.5 group-hover:bg-blue-500/20 transition-colors">
              <Check className="w-3 h-3 text-blue-400" />
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

        <div className="flex items-center gap-12 pt-8 border-t border-slate-800">
          <div>
            <div className="text-3xl font-semibold text-white mb-1">50K+</div>
            <div className="text-sm text-slate-400">Active users</div>
          </div>

          <div>
            <div className="text-3xl font-semibold text-white mb-1">99.9%</div>
            <div className="text-sm text-slate-400">Uptime</div>
          </div>

          <div>
            <div className="text-3xl font-semibold text-white mb-1">4.9★</div>
            <div className="text-sm text-slate-400">User rating</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthHero;
