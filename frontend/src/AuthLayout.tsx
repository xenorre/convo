import BorderAnimatedContainer from "@/components/BorderAnimatedContainer";
import ConvoLogo from "@/components/ConvoLogo";
import AuthHero from "@/components/AuthHero";

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full flex items-center justify-center p-4 bg-slate-900">
      <div className="relative w-full max-w-6xl lg:h-[700px] h-[650px]">
        <BorderAnimatedContainer>
          <div className="w-full flex flex-col md:flex-row">
            <div className="w-full lg:w-1/2 p-8 flex items-center justify-center md:border-r border-slate-600/30">
              <div className="max-w-md w-full">
                <ConvoLogo />
                {children}
              </div>
            </div>
            <AuthHero />
          </div>
        </BorderAnimatedContainer>
      </div>
    </div>
  );
}

export default AuthLayout;
