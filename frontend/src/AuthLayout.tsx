import BorderAnimatedContainer from "@/components/BorderAnimatedContainer";
import ConvoLogo from "@/components/ConvoLogo";
import AuthHero from "@/components/AuthHero";

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full items-center justify-center px-3 py-6 sm:px-6 sm:py-10 lg:p-8">
      <div className="relative w-full max-w-lg lg:max-w-6xl">
        <BorderAnimatedContainer>
          <div className="flex w-full min-w-0 flex-col lg:min-h-[700px] lg:flex-row">
            <div className="flex w-full min-w-0 items-center justify-center p-5 sm:p-8 lg:w-1/2 lg:border-r lg:border-slate-600/25 lg:p-10 xl:p-14">
              <div className="w-full max-w-md">
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
