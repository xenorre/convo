import { MessageCircle } from "lucide-react";

function ConvoLogo() {
  return (
    <div className="flex items-center gap-3 mb-12">
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
        <MessageCircle className="w-5 h-5 text-white" />
      </div>
      <span className="text-2xl font-bold text-white">Convo</span>
    </div>
  );
}

export default ConvoLogo;
