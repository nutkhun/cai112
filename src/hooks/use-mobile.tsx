import * as React from "react";

const MOBILE_BREAKPOINT = 768;

const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const getMatches = () => {
  if (typeof window === "undefined") return false;
  return window.matchMedia(query).matches;
};

/**
 * True while the viewport is narrower than the `md` breakpoint.
 *
 * The initial value is read synchronously so the first paint already matches
 * the device — otherwise phones briefly render the desktop tree, which causes
 * a visible layout jump and (worse) mounts the wrong set of Supabase
 * subscriptions for a frame.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(getMatches);

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);

    // Re-sync in case the viewport changed between render and effect.
    setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
