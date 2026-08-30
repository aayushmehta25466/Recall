/** @type {import('extension').FileConfig} */
export default {
  commands: {
    dev: {
      browser: "chrome",
    },
    build: {
      browser: "chrome",
      zip: true,
      zipFilename: "recall-chrome.zip",
    },
  },
};
