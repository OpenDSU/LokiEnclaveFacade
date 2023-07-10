const LightDBServer = require("./LightDBServer");
const LokiEnclaveFacade = require("./LokiEnclaveFacade");

const createLokiEnclaveFacadeInstance = (storage, autoSaveInterval, adaptorConstructorFunction) => {
    return new LokiEnclaveFacade(storage, autoSaveInterval, adaptorConstructorFunction);
}

const createLightDBServerInstance = (port, folder, callback) => {
    return new LightDBServer({rootFolder: folder, port: port}, callback);
}

module.exports = {
    createLokiEnclaveFacadeInstance,
    createLightDBServerInstance,
    Adaptors: require("./adaptors")
}