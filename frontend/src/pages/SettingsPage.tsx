import { Outlet, useMatch } from "react-router";
import TwoPanelLayout from "@/components/TwoPanelLayout";
import SettingsNav from "@/components/settings/SettingsNav";

function SettingsPage() {
  // On phones /settings is the section list and /settings/:section its content.
  const section = useMatch("/settings/:section")?.params.section;

  return (
    <TwoPanelLayout
      sidebarLabel="Settings"
      contentLabel="Settings section"
      showContent={Boolean(section)}
      sidebar={<SettingsNav activeSection={section} />}
      content={<Outlet />}
    />
  );
}

export default SettingsPage;
