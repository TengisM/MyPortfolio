// Runs before first paint. If the visitor already chose the regular website this session, mark
// <html data-view="site"> so the full-screen terminal never flashes on reload or language switch.
// A data attribute, not a class: React renders <html className>, and a class added here would be
// a hydration mismatch.
export const VIEW_KEY = 'tenggis:view'

export function ViewScript() {
  const js = `(function(){try{if(sessionStorage.getItem('${VIEW_KEY}')==='site'&&!location.pathname.startsWith('/admin'))document.documentElement.dataset.view='site'}catch(e){}})()`
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: must run before first paint (can't be an effect); content is a fixed literal.
      dangerouslySetInnerHTML={{ __html: js }}
    />
  )
}
