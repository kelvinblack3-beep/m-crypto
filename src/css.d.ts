// Lets TypeScript accept the `import './global.css'` side-effect import (Metro/Uniwind
// process the CSS at build time; this just declares the module for tsc).
declare module '*.css';
