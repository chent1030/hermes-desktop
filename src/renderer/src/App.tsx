import { ThemeProvider } from "./components/ThemeProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import DesktopRoot from "./platform/DesktopRoot";
import { PlatformProvider } from "./platform/PlatformProvider";

function App(): React.JSX.Element {
  const isMac = window.electron?.process?.platform === "darwin";

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <PlatformProvider>
          <div className="app">
            {isMac && <div className="drag-region" />}
            <div className="app-content">
              <DesktopRoot />
            </div>
          </div>
        </PlatformProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
