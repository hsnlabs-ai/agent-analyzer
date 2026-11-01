export type ActiveRoute =
  | { view: "workspace"; scanId: string }
  | { view: "settings" };

export function parseRoute(pathname: string): ActiveRoute {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  if (trimmed === "/settings") {
    return { view: "settings" };
  }
  const match = trimmed.match(/^\/scans\/([^/]+)$/);
  if (match) {
    return { view: "workspace", scanId: decodeURIComponent(match[1]) };
  }
  return { view: "workspace", scanId: "default-simulated-scan" };
}

export function navigateTo(path: string, onRouteChange: () => void): void {
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
  }
  onRouteChange();
}
