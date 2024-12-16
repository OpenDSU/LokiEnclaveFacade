function LokiEnclaveFacade(rootFolder, autosaveInterval, adaptorConstructorFunction) {
    const logger = $$.getLogger("LokiEnclaveFacade", "LokiEnclaveFacade.js");
    const LokiDb = require("./LokiDb");
    const openDSU = require("opendsu");
    const aclAPI = require("acl-magic");
    const utils = openDSU.loadAPI("utils");
    logger.info("Creating LokiEnclaveFacade instance");
    const EnclaveMixin = openDSU.loadAPI("enclave").EnclaveMixin;
    EnclaveMixin(this);

    let refreshInProgress = false;

    this.close = async () => {
        return await this.storageDB.close();
    }

    this.refreshInProgress = (forDID) => {
        return refreshInProgress;
    }

    this.refresh =  (forDID, callback) => {
        refreshInProgress = true;
        this.storageDB.refresh((err) => {
            refreshInProgress = false;
            callback(err);
        });
    }

    this.saveDatabase =  (forDID, callback) => {
        this.storageDB.saveDatabase(callback);
    }

    this.removeCollection =  (forDID, tableName, callback) => {
        this.storageDB.removeCollection(tableName, callback);
    }

    this.removeCollectionAsync =  (forDID, tableName) => {
        return new Promise((resolve, reject) => {
            this.storageDB.removeCollection(tableName, (err) => {
                if(err){
                    return reject(err);
                }
                resolve();
            });
        });
    }

    this.refreshAsync =  () => {
        let self = this;
        return new Promise((resolve, reject) => {
            self.storageDB.refresh((err)=>{
                if(err){
                    return reject(err);
                }
                resolve();
            });
        });
    }

    const WRITE_ACCESS = "write";
    const READ_ACCESS = "read";
    const WILDCARD = "*";
    const persistence = aclAPI.createEnclavePersistence(this);

    this.grantWriteAccess = (forDID, callback) => {
        persistence.grant(WRITE_ACCESS, WILDCARD, forDID, (err) => {
            if (err) {
                return callback(err);
            }

            this.grantReadAccess(forDID, callback);
        });
    }

    this.hasWriteAccess = (forDID, callback) => {
        persistence.loadResourceDirectGrants(WRITE_ACCESS, forDID, (err, usersWithAccess) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, usersWithAccess.indexOf(WILDCARD) !== -1);
        });
    }

    this.revokeWriteAccess = (forDID, callback) => {
        persistence.ungrant(WRITE_ACCESS, WILDCARD, forDID, callback);
    }

    this.grantReadAccess = (forDID, callback) => {
        persistence.grant(READ_ACCESS, WILDCARD, forDID, callback);
    }

    this.hasReadAccess = (forDID, callback) => {
        persistence.loadResourceDirectGrants(READ_ACCESS, forDID, (err, usersWithAccess) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, usersWithAccess.indexOf(WILDCARD) !== -1);
        });
    }

    this.revokeReadAccess = (forDID, callback) => {
        persistence.ungrant(READ_ACCESS, WILDCARD, forDID, err => {
            if (err) {
                return callback(err);
            }

            this.revokeWriteAccess(forDID, callback);
        });
    }

    this.getOneRecord = (forDID, tableName, callback) => {
        this.storageDB.getOneRecord(tableName, callback);
    }

    this.count = (forDID, tableName, callback) => {
        this.storageDB.count(tableName, callback);
    }

    this.addInQueue = (forDID, queueName, encryptedObject, ensureUniqueness, callback) => {
        this.storageDB.addInQueue(queueName, encryptedObject, ensureUniqueness, callback);
    }

    this.queueSize = (forDID, queueName, callback) => {
        this.count(queueName, callback);
    }

    this.listQueue = (forDID, queueName, sortAfterInsertTime, onlyFirstN, callback) => {
        this.storageDB.listQueue(queueName, sortAfterInsertTime, onlyFirstN, callback);
    }

    this.getObjectFromQueue = (forDID, queueName, hash, callback) => {
        return this.getRecord(forDID, queueName, hash, callback)
    }

    this.deleteObjectFromQueue = (forDID, queueName, hash, callback) => {
        return this.deleteRecord(forDID, queueName, hash, callback)
    }

    this.getCollections = (forDID, callback) => {
        this.storageDB.getCollections(callback);
    }

    this.createCollection =  (forDID, tableName, indicesList, callback) => {
        if (typeof indicesList === "function") {
            callback = indicesList;
            indicesList = undefined;
        }
        this.storageDB.createCollection(tableName, indicesList, callback);
    }

    this.allowedInReadOnlyMode = function (functionName){
        let readOnlyFunctions = ["getCollections",
            "listQueue",
            "queueSize",
            "count",
            "hasReadAccess",
            "getPrivateInfoForDID",
            "getCapableOfSigningKeySSI",
            "getPathKeyMapping",
            "getDID",
            "getPrivateKeyForSlot",
            "getIndexedFields",
            "getRecord",
            "getAllTableNames",
            "filter",
            "readKey",
            "getAllRecords",
            "getReadForKeySSI",
            "verifyForDID",
            "encryptMessage",
            "decryptMessage"];

        return readOnlyFunctions.indexOf(functionName) !== -1;
    }

    utils.bindAutoPendingFunctions(this, ["on", "off", "dispatchEvent", "beginBatch", "isInitialised", "getEnclaveType", "getDID", "getUniqueIdAsync"]);

    this.storageDB = new LokiDb(rootFolder, autosaveInterval, adaptorConstructorFunction);
    this.finishInitialisation();
}

module.exports = LokiEnclaveFacade;