# Handoff: A scroll spy, written out

## Findings

- **Docs parity:** The live docs sidebar and this example use the same push shape: each section sets its own link's `data-visible` on `state:\`enter\`` and removes it on `state:\`leave\``. The example uses `spy-` ids because the site concatenates example bodies in its smoke test; the docs page's `topnav` naming is the only naming difference, so no docs change is needed.
- **Header height:** `block-start:\`-#spy-header.height\`` resolves the sticky header's measured border-box height rather than repeating a number. A changed rounded height rebuilds the affected observers, including at a responsive breakpoint; the existing intersect tests cover the resize and transition-state behavior. A runtime writing-mode or direction change remains the documented non-rebuilding case.
- **`full`:** One sentence is enough when it says that `full:\`true\`` and `full:\`false\`` report transitions into and out of complete containment, independently of enter/leave. The page adds the concrete read-mark example and `once()` so the lasting mark is visibly intentional; no further docs mechanism is needed.
- **Initial state:** The observer's initial intersecting report runs the first section's `enter` phrase, so the first link lights without a page-load phrase. The first section remains partly inside the header-adjusted box on both desktop and the narrow layout, where the TOC is above the content.
- **Current-section caveat:** `enter`/`leave` reports real visibility, so more than one link can be lit while the viewport overlaps adjacent sections. The example keeps that honest behavior and uses tall sections to make the normal reading case easy to follow; it does not pretend the event guarantees one exclusive current item.

## Verification

- `pnpm run build` passes.
- `pnpm test` passes, including the scroll-spy site test, site listing, snippet drift, initial enter/leave, measured-header rebuild, full-view read mark, and console checks.
- `pnpm check` passes.
- A built `site-dist` page was exercised in Chromium at desktop and narrow viewports: the first link lights on load, the read mark appears after the read section is fully visible and remains, the narrow TOC precedes the content, and no console warnings or errors were produced.
