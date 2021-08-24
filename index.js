import loki from "./lib/lokijs/src/lokijs.js";
import lfsa from "./lib/lokijs/src/loki-fs-structured-adapter.js";

const adapter = new lfsa();
const defaultDBName = "defaultEnclaveDB"
const defaultTableName = "defaultEnclaveTable"
const defaultSaveInterval = 10000;
