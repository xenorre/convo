import { MessageCircle } from "lucide-react";

function ConvoLogo() {
  return (
    <div className="mb-8 flex items-center gap-3 lg:mb-10">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-950/30">
        <MessageCircle className="size-5 text-white" aria-hidden="true" />
      </div>
      <span className="text-2xl font-bold tracking-tight text-white">
        Convo
      </span>
    </div>
  );
}

export default ConvoLogo;
