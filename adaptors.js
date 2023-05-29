const lfsa = require("./lib/lokijs/src/loki-fs-sync-adapter.js");
const lfssa = require("./lib/lokijs/src/loki-fs-structured-adapter.js");

const Adaptors = {
    FS: lfsa,
    STRUCTURED: lfssa
}

module.exports = Adaptors;