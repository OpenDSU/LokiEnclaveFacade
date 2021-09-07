const loki = require("./lib/lokijs/src/lokijs.js");
const lfsa = require("./lib/lokijs/src/loki-fs-structured-adapter.js");

const adapter = new lfsa();
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

function DefaultEnclave(rootFolder) {
    require("opendsu"); // for error wrapper
    const DEFAULT_NAME = "defaultEnclave";
    const path = require("path");
    const AUTOSAVE_INTERVAL = 10000;
    if (typeof rootFolder === "undefined") {
        throw Error("Root folder was not specified for DefaultEnclave");
    }
    let db = new loki(rootFolder, {
        adapter: adapter,
        autoload: true,
        autoloadCallback: initialized.bind(this),
        autosave: true,
        autosaveInterval: AUTOSAVE_INTERVAL
    });

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

        db.saveDatabase(callback)
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
        db.saveDatabase(callback)
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

        db.saveDatabase(callback)
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
        if (typeof filterConditions === "undefined") {
            return lokiQuery;
        }

        filterConditions.forEach(condition =>{
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

    bindAutoPendingFunctions(this);

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

        self.filter(forDID, queueName, {}, "insertTime " + sortAfterInsertTime, onlyFirstN, (err, result) => {
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

}

function initialized() {
    this.finishInitialisation();
}

module.exports = DefaultEnclave;