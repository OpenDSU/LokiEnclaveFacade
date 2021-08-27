const loki = require("./lib/lokijs/src/lokijs.js");
const lfsa = require("./lib/lokijs/src/loki-fs-structured-adapter.js");

const adapter = new lfsa();
const defaultDBName = "defaultEnclaveDB"
const defaultTableName = "defaultEnclaveTable"
const defaultSaveInterval = 10000; // milliseconds
let bindAutoPendingFunctions = require("../opendsu/utils/BindAutoPendingFunctions").bindAutoPendingFunctions;

let filterOperationsMap = {
  "===": "$eq",
  "!==": "$ne",
  "==": "$aeq",
// Equality in time of $dteq
  ">": "$jgt",
  ">=": "$jgte",
  "<": "$jlt",
  "<=": "$jlte",
  "between": "$jbetween",
  "regex": "$regex"
}

function EnclaveDB(dbName, autoSaveInterval) {
  require("opendsu"); // for error wrapper

  let db = new loki(dbName || defaultDBName, {
    adapter: adapter,
    autoload: true,
    autoloadCallback: initialized.bind(this),
    autosave: true,
    autosaveInterval: autoSaveInterval || defaultSaveInterval
  })

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

  this.insertRecord = function (forDID, tableName, pk, record, callback) {
    let table = db.getCollection(tableName) || db.addCollection(tableName);
    try {
      table.insert({"pk": pk, "value": record, "did": forDID});
    } catch (err) {
      return callback(createOpenDSUErrorWrapper(` Could not insert record in table ${tableName} `, err))
    }
    callback(null, true);
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

    callback(null, true)
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
      return callback(createOpenDSUErrorWrapper(`Could not find object woth pk ${pk}`, err));
    }

    callback(null, result)
  }

  this.filterRecords = function (forDID, tableName, filterConditions, sort, max, callback) {

    if (typeof filterConditions === "function") {
      callback = filterConditions;
      filterConditions = undefined;
      sort = undefined;
      max = undefined;
    }

    if (typeof filterConditions === "undefined") {
      // if no filter provided return all
      filterConditions = {};
    }

    if (typeof sort === "function") {
      callback = sort;
      sort = undefined;
      max = undefined;
    }

    if (typeof max === "function") {
      callback = max;
      max = undefined;
    }

    let table = db.getCollection(tableName);
    if (!table) {
      return callback(createOpenDSUErrorWrapper(`Table ${tableName} not found`))
    }
    let sortObject;
    let direction = false;
    if (sort) {
      sortObject = sort.split(" ");
      if (sortObject[1] === "desc") {
        direction = true;
      }
    }

    let result;
    try {
      if (sort && max) {
        result = table.chain().find(filterConditions).simplesort(sortObject[0], direction).limit(max).data();
      }
      if (sort && !max) {
        result = table.chain().find(filterConditions).simplesort(sortObject[0], direction).data();
      }
      if (!sort && max) {
        result = table.chain().find(filterConditions).limit(max).data();
      }
      if (!sort && !max) {
        result = table.chain().find(filterConditions).data();
      }
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

    self.filterRecords(forDID, queueName, {}, "insertTime " + sortAfterInsertTime, onlyFirstN, (err, result) => {
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

module.exports = EnclaveDB;
