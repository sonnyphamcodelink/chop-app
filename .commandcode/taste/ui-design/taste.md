# Taste

- Wants screen-capture selection UX modeled on Snagit: yellow dashed border highlighting windows and dashed crosshair guides that follow the pointer while selecting a region. Confidence: 0.9
- Prefers direct in-place editing on the canvas (type straight into a callout/annotation by clicking it) over a separate input bar shown after creation. Confidence: 0.9
- Prefers annotation tools to work in every mode (click to select, edit, move, or resize an existing annotation from any tool state) rather than mode-restricted editing. Confidence: 0.8
- Prefers removing unneeded features entirely instead of leaving them as dead or unused buttons. Confidence: 0.8
- Wants exact, quantitative visual control — dash/gap lengths in px, sizes in px, specific colors — and sends corrections until pixel-perfect. Confidence: 0.9
- Prefers small, minimal resize handles (small white circles with black borders) over large colored squares. Confidence: 0.8
- Prefers a crosshair-style capture pointer: 4 strokes with a small empty center, black outline for contrast on light backgrounds, yellow/orange core, ~40px total. Confidence: 0.7
- Captured output must preserve original image and text quality — no zooming, no upscaling, no blur. Confidence: 0.8
- Actions should apply automatically on mouse release with no extra confirmation; stray or accidental clicks should do nothing (not create objects). Confidence: 0.8
- Annotation objects should have sensible default proportions/sizes on first creation so users don't have to manually resize them. Confidence: 0.7
- Prefers fixed positioning over movable decorative parts when motion adds no value (e.g., callout arrow anchored bottom-left and auto-stretching instead of being draggable). Confidence: 0.7
- Expects standard keyboard deletion for annotations: pressing Delete while an object is selected should delete it. Confidence: 0.6
- Wants all restyleable annotations (box, arrow, text, callout) to support recoloring after placement: selecting the object and clicking a toolbar color swatch should apply the color to that object as one undoable step, not just set a future default. Confidence: 0.8
- Prefers implicit save-on-blur for text input fields: clicking outside an active text field (or otherwise moving focus away) should commit the entered text automatically rather than requiring an explicit Enter keypress. Confidence: 0.7
- Requires custom cursors and dark UI elements to stay visible on dark/black capture backgrounds — dark elements need a light halo/outline beneath the dark core so they read on any background (reported as a bug: mouse hard to see when dragging over a black capture). Confidence: 0.85
- Prefers in-app download/install flows with a visible progress bar and automatic replacement over redirecting the user to an external page (e.g., the GitHub release page). Confidence: 0.9
- Wants destructive/irreversible UI actions (e.g., removing a license) to require an explicit confirmation step rather than applying immediately. Confidence: 0.8
- Wants the app to auto-detect the user's OS and offer the correct installer/download path instead of making them choose manually. Confidence: 0.7
