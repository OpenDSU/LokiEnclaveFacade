const Adapters = {
    FS: require("./lib/lokijs/src/lokijs").LokiFsAdapter,
    FS_SYNC: require("./lib/lokijs/src/loki-fs-sync-adapter.js"),
    STRUCTURED: require("./lib/lokijs/src/loki-fs-structured-adapter.js"),
    PARTITIONED: function () {
        const LokiPartitioningAdapter = require("./lib/lokijs/src/lokijs").LokiPartitioningAdapter
        const LokiFsAdapter = require("./lib/lokijs/src/lokijs").LokiFsAdapter
        return new LokiPartitioningAdapter(new LokiFsAdapter());
    }
}

module.exports = Adapters;