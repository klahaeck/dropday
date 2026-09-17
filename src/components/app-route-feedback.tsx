export function AppRouteLoading() {
  return <div className="app-route-feedback" role="status" aria-live="polite">
    <span className="section-kicker">Loading</span>
    <div className="app-route-skeleton app-route-skeleton-title" />
    <div className="app-route-skeleton app-route-skeleton-copy" />
    <div className="app-route-skeleton-grid">
      <div className="app-route-skeleton app-route-skeleton-card" />
      <div className="app-route-skeleton app-route-skeleton-card" />
      <div className="app-route-skeleton app-route-skeleton-card" />
    </div>
    <span className="sr-only">Loading this page…</span>
  </div>;
}
