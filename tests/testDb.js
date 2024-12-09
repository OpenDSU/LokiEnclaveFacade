const getTestDb = require("./test-util").getTestDb;

function getEnclaveDB(dbName) {
    let createLokiEnclaveFacadeInstance = require("../index.js").createLokiEnclaveFacadeInstance;
    return createLokiEnclaveFacadeInstance(dbName);
}

const adapter = getEnclaveDB("test");
getTestDb(adapter, 'loki');