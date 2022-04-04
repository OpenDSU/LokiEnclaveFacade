const loki = require("./lib/lokijs/src/lokijs.js");
const lfsa = require("./lib/lokijs/src/loki-fs-sync-adapter.js");
const lfssa = require("./lib/lokijs/src/loki-fs-structured-adapter");

const adapter = new lfssa();
let bindAutoPendingFunctions = require("../opendsu/utils/BindAutoPendingFunctions").bindAutoPendingFunctions;

let filterOperationsMap = {
    "!=": "$ne",
    "==": "$aeq",
    ">": "$jgt",
    ">=": "$jgte",
    "<": "$jlt",
    "<=": "$jlte",
    "like": "$regex"
}

function DefaultEnclave(rootFolder, autosaveInterval) {
    const openDSU = require("opendsu");
    const keySSISpace = openDSU.loadAPI("keyssi")
    const w3cDID = openDSU.loadAPI("w3cdid")
    const CryptoSkills = w3cDID.CryptographicSkills;

    const DEFAULT_NAME = "defaultEnclave";
    const path = require("path");
    const KEY_SSIS_TABLE = "keyssis";
    const SEED_SSIS_TABLE = "seedssis";
    const DIDS_PRIVATE_KEYS = "dids_private";

    const AUTOSAVE_INTERVAL = 1000;
    autosaveInterval = autosaveInterval || AUTOSAVE_INTERVAL;
    if (typeof rootFolder === "undefined") {
        throw Error("Root folder was not specified for DefaultEnclave");
    }
    let db = new loki(rootFolder, {
        adapter: adapter,
        autoload: true,
        autoloadCallback: initialized.bind(this),
        autosave: true,
        autosaveInterval: autosaveInterval
    });

    this.refresh = function (callback) {
        db.loadDatabaseInternal(undefined, callback);
    }

    this.count = function (tableName, callback) {
        let table = db.getCollection(tableName);
        if (!table) {
            return callback(createOpenDSUErrorWrapper(`Table ${tableName} not found`))
        }
        let result;
        try {
            result = table.count();
        } catch (err) {
            return callback(createOpenDSUErrorWrapper(`Could not count on ${tableName}`, err))
        }

        callback(null, result)
    }

    this.getCollections = function () {
        return db.listCollections().map(collection => {
            return collection.name
        })
    }

    this.insertRecord = function (forDID, tableName, pk, record, callback) {
        let table = db.getCollection(tableName) || db.addCollection(tableName);
        const foundRecord = table.findOne({'pk': pk});
        if (foundRecord) {
            return callback(createOpenDSUErrorWrapper(`A record with pk ${pk} already exists in ${tableName}`))
        }

        try {
            table.insert({"pk": pk, ...record, "did": forDID, "__timestamp": Date.now()});
        } catch (err) {
            return callback(createOpenDSUErrorWrapper(` Could not insert record in table ${tableName} `, err))
        }

        setTimeout(() => {
            db.saveDatabaseInternal(callback)
        }, autosaveInterval)
    }

    this.updateRecord = function (forDID, tableName, pk, record, callback) {
        let table = db.getCollection(tableName);
        const doc = table.by("pk", pk);
        for (let prop in record) {
            doc[prop] = record[prop];
        }
        try {
            table.update(doc);
        } catch (err) {
            return callback(createOpenDSUErrorWrapper(` Could not insert record in table ${tableName} `, err));
        }
        setTimeout(() => {
            db.saveDatabaseInternal(callback)
        }, autosaveInterval)
    }

    this.deleteRecord = function (forDID, tableName, pk, callback) {
        let table = db.getCollection(tableName);
        if (!table) {
            return callback(createOpenDSUErrorWrapper(`Table ${tableName} not found`))
        }
        const record = table.findOne({'pk': pk});
        if (!record) {
            return callback(createOpenDSUErrorWrapper(`Couldn't find a record for pk ${pk} in ${tableName}`))
        }
        try {
            table.remove(record);
        } catch (err) {
            return callback(createOpenDSUErrorWrapper(`Couldn't do remove for pk ${pk} in ${tableName}`, err))
        }

        setTimeout(() => {
            db.saveDatabaseInternal(callback)
        }, autosaveInterval)
    }

    this.getRecord = function (forDID, tableName, pk, callback) {
        let table = db.getCollection(tableName);
        if (!table) {
            return callback(createOpenDSUErrorWrapper(`Table ${tableName} not found`))
        }
        let result;
        try {
            result = table.findObject({'pk': pk});
        } catch (err) {
            return callback(createOpenDSUErrorWrapper(`Could not find object with pk ${pk}`, err));
        }

        callback(null, result)
    }

    function __parseQuery(filterConditions) {
        let lokiQuery = {}
        if (!filterConditions) {
            return lokiQuery;
        }

        filterConditions.forEach(condition => {
            const splitCondition = condition.split(" ");
            const field = splitCondition[0];
            const operator = splitCondition[1];
            const value = splitCondition[2];
            lokiQuery[field] = {};
            lokiQuery[field][`${filterOperationsMap[operator]}`] = value;
        })
        return lokiQuery;
    }

    function __getSortingField(filterConditions) {
        let sortingField = "__timestamp";
        if (filterConditions && filterConditions.length) {
            sortingField = filterConditions[0][0];
        }

        return sortingField;
    }

    this.filter = function (forDID, tableName, filterConditions, sort, max, callback) {
        if (typeof filterConditions === "string") {
            filterConditions = [filterConditions];
        }

        if (typeof filterConditions === "function") {
            callback = filterConditions;
            filterConditions = undefined;
            sort = "asc";
            max = Infinity;
        }

        if (typeof sort === "function") {
            callback = sort;
            sort = "asc";
            max = Infinity;
        }

        if (typeof max === "function") {
            callback = max;
            max = Infinity;
        }

        if (!max) {
            max = Infinity;
        }

        const sortingField = __getSortingField(filterConditions);
        filterConditions = __parseQuery(filterConditions);

        let table = db.getCollection(tableName);
        if (!table) {
            return callback(createOpenDSUErrorWrapper(`Table ${tableName} not found`))
        }
        let direction = false;
        if (sort === "desc") {
            direction = true;
        }

        let result;
        try {
            result = table.chain().find(filterConditions).simplesort(sortingField, direction).limit(max).data();
        } catch (err) {
            return callback(createOpenDSUErrorWrapper(`Filter operation failed on ${tableName}`, err));
        }


        callback(null, result);
    }

    this.getAllRecords = (forDID, tableName, callback) => {
        let table = db.getCollection(tableName);
        if (!table) {
            return callback(createOpenDSUErrorWrapper(`Table ${tableName} not found`))
        }

        let results;
        try {
            results = table.find();
        } catch (err) {
            return callback(createOpenDSUErrorWrapper(`Filter operation failed on ${tableName}`, err));
        }


        callback(null, results);
    };

    bindAutoPendingFunctions(this);

    const READ_WRITE_KEY_TABLE = "KeyValueTable";

    this.writeKey = (forDID, key, value, callback) => {
        let valueObject = {
            type: typeof value,
            value: value
        };

        if (typeof value === "object") {
            if (Buffer.isBuffer(value)) {
                valueObject = {
                    type: "buffer",
                    value: value.toString()
                }
            } else {
                valueObject = {
                    type: "object",
                    value: JSON.stringify(value)
                }
            }
        }
        this.insertRecord(forDID, READ_WRITE_KEY_TABLE, key, valueObject, callback);
    }

    this.readKey = (forDID, key, callback) => {
        this.getRecord(forDID, READ_WRITE_KEY_TABLE, key, (err, record) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`Failed to read key ${key}`, err));
            }

            callback(undefined, record);
        })
    }

//------------------ queue -----------------
    let self = this;
    this.addInQueue = function (forDID, queueName, encryptedObject, callback) {
        let queue = db.getCollection(queueName) || db.addCollection(queueName);
        const crypto = require("opendsu").loadApi("crypto");
        const hash = crypto.sha256(encryptedObject);
        self.insertRecord(forDID, queueName, hash, encryptedObject, callback);
    }

    this.queueSize = function (forDID, queueName, callback) {
        self.count(queueName, callback);
    }

    this.listQueue = function (forDID, queueName, sortAfterInsertTime, onlyFirstN, callback) {

        if (typeof sortAfterInsertTime === "function") {
            callback = sortAfterInsertTime;
            sortAfterInsertTime = "asc";
            onlyFirstN = undefined
        }
        if (typeof onlyFirstN === "function") {
            callback = onlyFirstN;
            onlyFirstN = undefined;
        }

        self.filter(forDID, queueName, undefined, sortAfterInsertTime, onlyFirstN, (err, result) => {
            if (err) {
                return callback(err);
            }
            result = result.map(item => {
                return item.pk
            })
            return callback(null, result);
        })
    }

    this.getObjectFromQueue = function (forDID, queueName, hash, callback) {
        return self.getRecord(forDID, queueName, hash, callback)
    }

    this.deleteObjectFromQueue = function (forDID, queueName, hash, callback) {
        return self.deleteRecord(forDID, queueName, hash, callback)
    }

    //------------------ KeySSIs -----------------
    const getCapableOfSigningKeySSI = (keySSI, callback) => {
        if (typeof keySSI === "undefined") {
            return callback(Error(`A SeedSSI should be specified.`));
        }

        if (typeof keySSI === "string") {
            try {
                keySSI = keySSISpace.parse(keySSI);
            } catch (e) {
                return callback(createOpenDSUErrorWrapper(`Failed to parse keySSI ${keySSI}`, e))
            }
        }

        this.getRecord(undefined, KEY_SSIS_TABLE, keySSI.getIdentifier(), (err, record) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`No capable of signing keySSI found for keySSI ${keySSI.getIdentifier()}`, err));
            }

            let capableOfSigningKeySSI;
            try {
                capableOfSigningKeySSI = keySSISpace.parse(record.capableOfSigningKeySSI);
            } catch (e) {
                return callback(createOpenDSUErrorWrapper(`Failed to parse keySSI ${record.capableOfSigningKeySSI}`, e))
            }

            callback(undefined, capableOfSigningKeySSI);
        });
    };

    this.storeSeedSSI = (forDID, seedSSI, alias, callback) => {
        if (typeof seedSSI === "string") {
            try {
                seedSSI = keySSISpace.parse(seedSSI);
            } catch (e) {
                return callback(createOpenDSUErrorWrapper(`Failed to parse keySSI ${seedSSI}`, e))
            }
        }

        const keySSIIdentifier = seedSSI.getIdentifier();

        const registerDerivedKeySSIs = (derivedKeySSI) => {
            this.insertRecord(forDID, KEY_SSIS_TABLE, derivedKeySSI.getIdentifier(), {capableOfSigningKeySSI: keySSIIdentifier}, (err) => {
                if (err) {
                    return callback(err);
                }

                try {
                    derivedKeySSI = derivedKeySSI.derive();
                } catch (e) {
                    return callback();
                }

                registerDerivedKeySSIs(derivedKeySSI);
            });
        }

        this.insertRecord(forDID, SEED_SSIS_TABLE, alias, {seedSSI: keySSIIdentifier}, (err) => {
            if (err) {
                return callback(err);
            }

            return registerDerivedKeySSIs(seedSSI);
        })
    }

    this.signForKeySSI = (forDID, keySSI, hash, callback) => {
        getCapableOfSigningKeySSI(keySSI, (err, capableOfSigningKeySSI) => {
            if (err) {
                return callback(err);
            }
            if (typeof capableOfSigningKeySSI === "undefined") {
                return callback(Error(`The provided SSI does not grant writing rights`));
            }

            capableOfSigningKeySSI.sign(hash, callback);
        });
    }

    //------------------ DIDs -----------------
    const getPrivateInfoForDID = (did, callback) => {
        this.getRecord(undefined, DIDS_PRIVATE_KEYS, did, (err, record) => {
            if (err) {
                return callback(err);
            }

            const privateKeysAsBuff = record.privateKeys.map(privateKey => {
                if (privateKey) {
                    return $$.Buffer.from(privateKey)
                }

                return privateKey;
            });
            callback(undefined, privateKeysAsBuff);
        });
    };

    const __ensureAreDIDDocumentsThenExecute = (did, fn, callback) => {
        if (typeof did === "string") {
            return w3cDID.resolveDID(did, (err, didDocument) => {
                if (err) {
                    return callback(err);
                }

                fn(didDocument, callback);
            })
        }

        fn(did, callback);
    }

    this.storeDID = (forDID, storedDID, privateKeys, callback) => {
        this.getRecord(forDID, DIDS_PRIVATE_KEYS, storedDID, (err, res) => {
            if (err || !res) {
                return this.insertRecord(forDID, DIDS_PRIVATE_KEYS, storedDID, {privateKeys: privateKeys}, callback);
            }

            privateKeys.forEach(privateKey => {
                res.privateKeys.push(privateKey);
            })
            this.updateRecord(forDID, DIDS_PRIVATE_KEYS, storedDID, res, callback);
        });
    }

    this.signForDID = (forDID, didThatIsSigning, hash, callback) => {
        const __signForDID = (didThatIsSigning, callback) => {
            getPrivateInfoForDID(didThatIsSigning.getIdentifier(), (err, privateKeys) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to get private info for did ${didThatIsSigning.getIdentifier()}`, err));
                }

                const signature = CryptoSkills.applySkill(didThatIsSigning.getMethodName(), CryptoSkills.NAMES.SIGN, hash, privateKeys[privateKeys.length - 1]);
                callback(undefined, signature);
            });
        }

        __ensureAreDIDDocumentsThenExecute(didThatIsSigning, __signForDID, callback);
    }

    this.verifyForDID = (forDID, didThatIsVerifying, hash, signature, callback) => {
        const __verifyForDID = (didThatIsVerifying, callback) => {
            didThatIsVerifying.getPublicKey("pem", (err, publicKey) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to read public key for did ${didThatIsVerifying.getIdentifier()}`, err));
                }

                const verificationResult = CryptoSkills.applySkill(didThatIsVerifying.getMethodName(), CryptoSkills.NAMES.VERIFY, hash, publicKey, $$.Buffer.from(signature));
                callback(undefined, verificationResult);
            });
        }

        __ensureAreDIDDocumentsThenExecute(didThatIsVerifying, __verifyForDID, callback);
    }

    this.encryptMessage = (forDID, didFrom, didTo, message, callback) => {
        const __encryptMessage = () => {
            getPrivateInfoForDID(didFrom.getIdentifier(), (err, privateKeys) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to get private info for did ${didFrom.getIdentifier()}`, err));
                }

                CryptoSkills.applySkill(didFrom.getMethodName(), CryptoSkills.NAMES.ENCRYPT_MESSAGE, privateKeys, didFrom, didTo, message, callback);
            });
        }
        if (typeof didFrom === "string") {
            w3cDID.resolveDID(didFrom, (err, didDocument) => {
                if (err) {
                    return callback(err);
                }

                didFrom = didDocument;


                if (typeof didTo === "string") {
                    w3cDID.resolveDID(didTo, (err, didDocument) => {
                        if (err) {
                            return callback(err);
                        }

                        didTo = didDocument;
                        __encryptMessage();
                    })
                } else {
                    __encryptMessage();
                }
            })
        } else {
            __encryptMessage();
        }
    }

    this.decryptMessage = (forDID, didTo, encryptedMessage, callback) => {
        const __decryptMessage = (didTo, callback) => {
            getPrivateInfoForDID(didTo.getIdentifier(), (err, privateKeys) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to get private info for did ${didTo.getIdentifier()}`, err));
                }

                CryptoSkills.applySkill(didTo.getMethodName(), CryptoSkills.NAMES.DECRYPT_MESSAGE, privateKeys, didTo, encryptedMessage, callback);
            });
        }
        __ensureAreDIDDocumentsThenExecute(didTo, __decryptMessage, callback);
    };
}

function initialized() {
    this.finishInitialisation();
}

module.exports = DefaultEnclave;