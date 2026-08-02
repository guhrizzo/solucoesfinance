/**
 * Applies the content offset for the vertical navbar layout purely via CSS
 * (see html[data-nav-layout="vertical"] .app-shell in globals.css), replacing
 * the previous approach of a MutationObserver injecting inline marginLeft on
 * every direct child of <body>.
 *
 * This intentionally does NOT read useNavbarLayout() / render a dynamic
 * attribute here: the offset is driven by the data-nav-layout attribute the
 * inline script in layout.tsx sets on <html> before hydration, so it's correct
 * on first paint with no flash and no server/client render mismatch.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell">{children}</div>;
}
