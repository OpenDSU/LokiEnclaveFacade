const LightDBServer = require("./LightDBServer");
const LokiEnclaveFacade = require("./LokiEnclaveFacade");

const createLokiEnclaveFacadeInstance = (storage, autoSaveInterval, adaptorConstructorFunction) => {
    return new LokiEnclaveFacade(storage, autoSaveInterval, adaptorConstructorFunction);
}

const createLightDBServerInstance = (port, folder, host, callback) => {
    if(typeof host === "function"){
        callback = host;
        host = undefined;
    }
    return new LightDBServer({rootFolder: folder, port, host}, callback);
}

module.exports = {
    createLokiEnclaveFacadeInstance,
    createLightDBServerInstance,
    Adaptors: require("./adaptors")
}
