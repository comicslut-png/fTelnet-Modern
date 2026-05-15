// Placeholder. Referenced by index.html's <script id="fTelnetScript">.
// Exists so:
//   - fTelnetClient's constructor finds the expected #fTelnetScript element
//   - StringUtils.GetUrl can use its src attribute (/placeholder.js) to
//     resolve sibling assets at the / path of the dev server
// In production this is the actual bundled JS.
