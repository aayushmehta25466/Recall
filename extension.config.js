/** @type {import('extension').FileConfig} */
export default {
  commands: {
    dev: {
      browser: "chrome",
    },
    build: {
      // Per-target zip names live in the package.json scripts (--zip-filename);
      // a name here would leak into every target's build.
      browser: "chrome",
      zip: true,
    },
  },
};
