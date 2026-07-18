import './RouteLoadingScreen.css';

export default function RouteLoadingScreen() {
  return (
    <div className="route-loading-screen" role="status" aria-label="Loading screen">
      <div className="route-loading-screen__signal" aria-hidden="true"><span /><span /><span /></div>
      <p>Preparing the house…</p>
    </div>
  );
}
