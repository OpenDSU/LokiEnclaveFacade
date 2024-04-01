const Adaptors = require("./adaptors.js");
const loki = require("./lib/lokijs/src/lokijs.js");

let filterOperationsMap = {
    "!=": "$ne",
    "==": "$aeq",
    ">": "$jgt",
    ">=": "$jgte",
    "<": "$jlt",
    "<=": "$jlte",
    "like": "$regex"
}

function LokiDb(rootFolder, autosaveInterval, adaptorConstructorFunction) {
    const openDSU = require("opendsu");
    const aclAPI = require("acl-magic");
    const keySSISpace = openDSU.loadAPI("keyssi")
    const w3cDID = openDSU.loadAPI("w3cdid")
    const utils = openDSU.loadAPI("utils");
    const CryptoSkills = w3cDID.CryptographicSkills;
    const logger = $$.getLogger("LokiEnclaveFacade", "lokiEnclaveFacade");
    const KEY_SSIS_TABLE = "keyssis";
    const SEED_SSIS_TABLE = "seedssis";
    const DIDS_PRIVATE_KEYS = "dids_private";
    const AUTOSAVE_INTERVAL = 100;
    const adapter = adaptorConstructorFunction === undefined ? new Adaptors.STRUCTURED() : new adaptorConstructorFunction();

    autosaveInterval = autosaveInterval || AUTOSAVE_INTERVAL;
    if (typeof rootFolder === "undefined") {
        throw Error("Root folder was not specified for LokiEnclaveFacade");
    }
    let db = new loki(rootFolder, {
        adapter: adapter,
        autoload: true,
        autoloadCallback: initialized.bind(this),
        autosave: true,
        autosaveInterval: autosaveInterval,
        autosaveCallback: function (err) {
            if (err) {
                logger.error(`Failed to save db on disk.`, err)
            }
        }
    });

    this.close = async () => {
        return new Promise((resolve, reject) => {
            db.close((err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
    }

    this.refresh = function (callback) {
        db.loadDatabaseInternal(undefined, callback);
    }
    const WRITE_ACCESS = "write";
    const READ_ACCESS = "read";
    const WILDCARD = "*";
    const persistence = aclAPI.createEnclavePersistence(this);

    this.grantWriteAccess = (callback) => {
        persistence.grant(WRITE_ACCESS, WILDCARD, (err) => {
            if (err) {
                return callback(err);
            }

            this.grantReadAccess(callback);
        });
    }

    this.hasWriteAccess = (callback) => {
        persistence.loadResourceDirectGrants(WRITE_ACCESS, (err, usersWithAccess) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, usersWithAccess.indexOf(WILDCARD) !== -1);
        });
    }

    this.revokeWriteAccess = (callback) => {
        persistence.ungrant(WRITE_ACCESS, WILDCARD, callback);
    }

    this.grantReadAccess = (callback) => {
        persistence.grant(READ_ACCESS, WILDCARD, callback);
    }

    this.hasReadAccess = (callback) => {
        persistence.loadResourceDirectGrants(READ_ACCESS, (err, usersWithAccess) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, usersWithAccess.indexOf(WILDCARD) !== -1);
        });
    }

    this.revokeReadAccess = (callback) => {
        persistence.ungrant(READ_ACCESS, WILDCARD, err => {
            if (err) {
                return callback(err);
            }

            this.revokeWriteAccess(callback);
        });
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

    this.getCollections = (callback) => {
        const collections = db.listCollections();
        if (Array.isArray(collections)) {
            return callback(undefined, collections.map(collection => collection.name));
        }

        callback(undefined, []);
    }

    this.createCollection = function (tableName, indicesList, callback) {
        if (typeof indicesList === "function") {
            callback = indicesList;
            indicesList = undefined;
        }

        try {
            db.addCollection(tableName, {indices: indicesList});
        } catch (err) {
            return callback(createOpenDSUErrorWrapper(`Could not create collection ${tableName}`, err))
        }
        callback();
    }

    this.addIndex = function (tableName, property, callback) {
        let table = db.getCollection(tableName) || db.addCollection(tableName);
        try {
            table.ensureIndex(property, true);
        } catch (err) {
            return callback(createOpenDSUErrorWrapper(`Could not add index ${property} on ${tableName}`, err))
        }
        callback();
    }

    this.insertRecord = (tableName, pk, record, callback) => {
        let table = db.getCollection(tableName) || db.addCollection(tableName);
        if (record.meta) {
            delete record.meta;
        }

        if (record.$loki) {
            delete record.$loki;
        }

        let foundRecord = table.findObject({'pk': pk});

        if (foundRecord) {
            let error = `A record with pk ${pk} already exists in ${tableName}`
            console.log(error);
            return callback(createOpenDSUErrorWrapper(error));
        }
        let result;
        try {
            result = table.insert({
                "pk": pk, ...record,
                "__timestamp": record.__timestamp || Date.now()
            });
        } catch (err) {
            console.log(`Failed to insert ${pk} into table ${tableName}`, err);
            return callback(createOpenDSUErrorWrapper(` Could not insert record in table ${tableName} `, err))
        }

        callback(null, result);
    }

    this.updateRecord = function (tableName, pk, record, callback) {
        let table = db.getCollection(tableName);
        let doc;
        try {
            doc = table.by("pk", pk);
            for (let prop in record) {
                doc[prop] = record[prop];
            }
        } catch (err) {
            logger.error(err);
            logger.debug(`Failed to update ${pk} in table ${tableName}`);
            return callback(createOpenDSUErrorWrapper(`Could not update record in table ${tableName}`, err));
        }

        doc.__timestamp = Date.now();
        let result;
        try {
            result = table.update(doc);
        } catch (err) {
            return callback(createOpenDSUErrorWrapper(` Could not insert record in table ${tableName} `, err));
        }

        callback(null, result);
    }

    this.deleteRecord = function (tableName, pk, callback) {
        let table = db.getCollection(tableName);
        if (!table) {
            return callback();
        }

        let record = table.findOne({'pk': pk});
        if (!record) {
            return callback(undefined);
        }

        try {
            table.findAndRemove({'pk': pk});
        } catch (err) {
            return callback(createOpenDSUErrorWrapper(`Couldn't do remove for pk ${pk} in ${tableName}`, err))
        }

        callback(null, record);
    }

    this.getRecord = function (tableName, pk, callback) {
        let table = db.getCollection(tableName);
        if (!table) {
            return callback(Error(`Table ${tableName} not found`));
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
            const splitCondition = filterConditions[0].split(" ");
            sortingField = splitCondition[0];
        }

        return sortingField;
    }

    this.filter = function (tableName, filterConditions, sort, max, callback) {
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
            return callback(undefined, []);
        }
        let direction = false;
        if (sort === "desc" || sort === "dsc") {
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

    this.getAllRecords = (tableName, callback) => {
        let table = db.getCollection(tableName);
        if (!table) {
            return callback(undefined, []);
        }

        let results;
        try {
            results = table.find();
        } catch (err) {
            return callback(createOpenDSUErrorWrapper(`Filter operation failed on ${tableName}`, err));
        }

        if (!results) {
            results = [];
        }
        callback(null, results);
    };

    utils.bindAutoPendingFunctions(this);

    const READ_WRITE_KEY_TABLE = "KeyValueTable";

    this.writeKey = (key, value, callback) => {
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
        this.insertRecord(READ_WRITE_KEY_TABLE, key, valueObject, callback);
    }

    this.readKey = (key, callback) => {
        this.getRecord(READ_WRITE_KEY_TABLE, key, (err, record) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`Failed to read key ${key}`, err));
            }

            callback(undefined, record);
        })
    }

    //------------------ queue -----------------
    let self = this;
    this.addInQueue = function (queueName, encryptedObject, ensureUniqueness, callback) {
        if (typeof ensureUniqueness === "function") {
            callback = ensureUniqueness;
            ensureUniqueness = false;
        }
        let queue = db.getCollection(queueName) || db.addCollection(queueName);
        const crypto = require("opendsu").loadApi("crypto");
        const hash = crypto.sha256(encryptedObject);
        let pk = hash;
        if (ensureUniqueness) {
            pk = `${hash}_${Date.now()}_${crypto.encodeBase58(crypto.generateRandom(10))}`;
        }
        self.insertRecord(queueName, pk, encryptedObject, (err) => callback(err, pk));
    }

    this.queueSize = function (queueName, callback) {
        self.count(queueName, callback);
    }

    this.listQueue = function (queueName, sortAfterInsertTime, onlyFirstN, callback) {
        if (typeof sortAfterInsertTime === "function") {
            callback = sortAfterInsertTime;
            sortAfterInsertTime = "asc";
            onlyFirstN = undefined
        }
        if (typeof onlyFirstN === "function") {
            callback = onlyFirstN;
            onlyFirstN = undefined;
        }

        self.filter(queueName, undefined, sortAfterInsertTime, onlyFirstN, (err, result) => {
            if (err) {
                if (err.code === 404) {
                    return callback(undefined, []);
                }

                return callback(err);
            }

            /*            result = result.filter(item => {
                            if(typeof item.$loki !== "undefined"){
                                return true;
                            }
                            logger.warn("A message was filtered out because wrong loki document structure");
                            return false;
                        });*/

            result = result.map(item => {
                return item.pk
            })
            return callback(null, result);
        })
    }

    this.getObjectFromQueue = function (queueName, hash, callback) {
        return self.getRecord(queueName, hash, callback)
    }

    this.deleteObjectFromQueue = function (queueName, hash, callback) {
        return self.deleteRecord(queueName, hash, callback)
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

    this.storeSeedSSI = (seedSSI, alias, callback) => {
        if (typeof seedSSI === "string") {
            try {
                seedSSI = keySSISpace.parse(seedSSI);
            } catch (e) {
                return callback(createOpenDSUErrorWrapper(`Failed to parse keySSI ${seedSSI}`, e))
            }
        }

        const keySSIIdentifier = seedSSI.getIdentifier();

        const registerDerivedKeySSIs = (derivedKeySSI) => {
            this.insertRecord(KEY_SSIS_TABLE, derivedKeySSI.getIdentifier(), {capableOfSigningKeySSI: keySSIIdentifier}, (err) => {
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

        this.insertRecord(SEED_SSIS_TABLE, alias, {seedSSI: keySSIIdentifier}, (err) => {
            if (err) {
                return callback(err);
            }

            return registerDerivedKeySSIs(seedSSI);
        })
    }

    this.signForKeySSI = (keySSI, hash, callback) => {
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

    this.storeDID = (storedDID, privateKeys, callback) => {
        this.getRecord(DIDS_PRIVATE_KEYS, storedDID, (err, res) => {
            if (err || !res) {
                return this.insertRecord(DIDS_PRIVATE_KEYS, storedDID, {privateKeys: privateKeys}, callback);
            }

            privateKeys.forEach(privateKey => {
                res.privateKeys.push(privateKey);
            })
            this.updateRecord(DIDS_PRIVATE_KEYS, storedDID, res, callback);
        });
    }

    this.signForDID = (didThatIsSigning, hash, callback) => {
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

    this.verifyForDID = (didThatIsVerifying, hash, signature, callback) => {
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

    this.encryptMessage = (didFrom, didTo, message, callback) => {
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

    this.decryptMessage = (didTo, encryptedMessage, callback) => {
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

LokiDb.prototype.Adaptors = Adaptors;
module.exports = LokiDb;