import Layout from "../screens/Layout/Layout";
import Initializing from "../screens/Initializing/Initializing";
import Login from "../screens/Login/Login";
import { usePlatform } from "./usePlatform";

export default function DesktopRoot(): React.JSX.Element {
  const { stage } = usePlatform();

  if (stage === "login") {
    return <Login />;
  }

  if (stage === "initializing") {
    return <Initializing />;
  }

  return <Layout />;
}
