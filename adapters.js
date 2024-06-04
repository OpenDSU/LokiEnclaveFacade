const Adapters = {
    FS: require("./lib/lokijs/src/lokijs").LokiFsAdapter,
    FS_SYNC: require("./lib/lokijs/src/loki-fs-sync-adapter.js"),
    STRUCTURED: require("./lib/lokijs/src/loki-fs-structured-adapter.js"),
    PARTITIONED: require("./lib/lokijs/src/lokijs").LokiPartitioningAdapter
}

module.exports = Adapters;