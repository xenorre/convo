import type { ReactNode } from "react";
import BorderAnimatedContainer from "./BorderAnimatedContainer";
import { ConnectionStatus } from "./ConnectionStatus";

interface TwoPanelLayoutProps {
  sidebar: ReactNode;
  sidebarLabel: string;
  content: ReactNode;
  contentLabel: string;
  // Below md only one panel fits, so the content replaces the sidebar.
  showContent: boolean;
  // Floats above both panels, positioned by itself (e.g. minimized chats).
  overlay?: ReactNode;
}

// Shell shared by the chats and settings screens: a list on the left and
// the selected item on the right.
function TwoPanelLayout({
  sidebar,
  sidebarLabel,
  content,
  contentLabel,
  showContent,
  overlay,
}: TwoPanelLayoutProps) {
  return (
    <div className="chat-layout relative w-full min-w-0 max-w-6xl">
      <BorderAnimatedContainer>
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
          <ConnectionStatus />
          <div className="flex min-h-0 min-w-0 flex-1">
            <aside
              aria-label={sidebarLabel}
              className={`${showContent ? "hidden md:flex" : "flex"} h-full w-full min-w-0 shrink-0 flex-col bg-slate-800/45 md:w-72 md:border-r md:border-slate-700/50 lg:w-80`}
            >
              {sidebar}
            </aside>

            <section
              aria-label={contentLabel}
              className={`${showContent ? "flex" : "hidden md:flex"} h-full min-h-0 min-w-0 flex-1 flex-col bg-slate-900/65`}
            >
              {content}
            </section>
          </div>
        </div>
      </BorderAnimatedContainer>
      {overlay}
    </div>
  );
}

export default TwoPanelLayout;
