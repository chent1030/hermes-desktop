import { usePlatform } from "../../platform/usePlatform";

export default function Initializing(): React.JSX.Element {
  const { initError, retryInitialization } = usePlatform();

  return (
    <div className="initializing-screen">
      <h1>Initializing workspace</h1>
      <p>Loading tenant context, models, and skills...</p>
      {initError && (
        <>
          <div className="initializing-error">{initError}</div>
          <button onClick={() => void retryInitialization()}>Retry</button>
        </>
      )}
    </div>
  );
}
