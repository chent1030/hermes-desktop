import Initializing from "../screens/Initializing/Initializing";
import Login from "../screens/Login/Login";
import WorkspaceShell from "../screens/Workspace/WorkspaceShell";
import { usePlatform } from "./usePlatform";

export default function DesktopRoot(): React.JSX.Element {
  const { stage, workspace, audit } = usePlatform();

  if (stage === "login") {
    return <Login />;
  }

  if (stage === "initializing") {
    return <Initializing />;
  }

  if (!workspace) {
    return <Initializing />;
  }

  return <WorkspaceShell workspace={workspace} audit={audit} />;
}
