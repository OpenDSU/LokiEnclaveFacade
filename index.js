const LightDBServer = require("./LightDBServer");
const LokiEnclaveFacade = require("./LokiEnclaveFacade");

const createLokiEnclaveFacadeInstance = (storage, autoSaveInterval, adaptorConstructorFunction) => {
    return new LokiEnclaveFacade(storage, autoSaveInterval, adaptorConstructorFunction);
}

const createLightDBServerInstance = (config, callback) => {
    return new LightDBServer(config, callback);
}

module.exports = {
    createLokiEnclaveFacadeInstance,
    createLightDBServerInstance,
    Adaptors: require("./adaptors")
}
