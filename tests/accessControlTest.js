require(" ../../../builds/output/testsRuntime");
const tir = require("../../../psknode/tests/util/tir");
const dc = require("double-check");
const assert = dc.assert;

function getEnclaveDB(dbName) {
    let createLokiEnclaveFacadeInstance = require("../index.js").createLokiEnclaveFacadeInstance;
    return createLokiEnclaveFacadeInstance(dbName);
}

assert.callback("Enclave default db insert test", (testFinishCallback) => {
    dc.createTestFolder("enclaveDBTest", async function (err, folder) {
        const DOMAIN = "default";
        await tir.launchConfigurableApiHubTestNodeAsync({domains: [{name: DOMAIN, config: {anchoring: {type: "FS"}}}]});
        const path = require("path");
        let dbPath = path.join(folder, "test_db");
        // fs.mkdirSync(dbPath, {recursive: true});
        let lokiEnclaveFacade = getEnclaveDB(dbPath);
        const openDSU = require("opendsu");
        const w3cDID = openDSU.loadAPI("w3cdid");
        let error, userDID;
        [error, userDID] = await $$.call(w3cDID.createIdentity, "ssi:name", DOMAIN, "user");
        if (error) {
            throw error;
        }
        let anotherUserDID;
        [error, anotherUserDID] = await $$.call(w3cDID.createIdentity, "ssi:name", DOMAIN, "anotherUser");
        anotherUserDID = anotherUserDID.getIdentifier();
        if (error) {
            throw error;
        }

        await $$.call(lokiEnclaveFacade.grantWriteAccess, userDID);
        let hasWriteAccess;
        [error, hasWriteAccess] = await $$.call(lokiEnclaveFacade.hasWriteAccess, userDID);
        assert.true(hasWriteAccess, "User should have write access");

        let anotherUserHasWriteAccess;
        [error, anotherUserHasWriteAccess] = await $$.call(lokiEnclaveFacade.hasWriteAccess, anotherUserDID);
        assert.false(anotherUserHasWriteAccess, "Another user should not have write access");

        let hasReadAccess;
        [error, hasReadAccess] = await $$.call(lokiEnclaveFacade.hasReadAccess, userDID);
        assert.true(hasReadAccess, "User should have read access");

        let anotherUserHasReadAccess;
        [error, anotherUserHasReadAccess] = await $$.call(lokiEnclaveFacade.hasReadAccess, anotherUserDID);
        assert.false(anotherUserHasReadAccess, "Another user should not have read access");

        await $$.call(lokiEnclaveFacade.revokeWriteAccess, userDID);
        let hasWriteAccessAfterRevoke;
        [error, hasWriteAccessAfterRevoke] = await $$.call(lokiEnclaveFacade.hasWriteAccess, userDID);
        if (error) {
            throw error;
        }
        assert.false(hasWriteAccessAfterRevoke, "User should not have write access");

        let hasReadAccessAfterRevoke;
        [error, hasReadAccessAfterRevoke] = await $$.call(lokiEnclaveFacade.hasReadAccess, userDID);
        if (error) {
            throw error;
        }
        assert.true(hasReadAccessAfterRevoke, "User should have read access");

        await $$.call(lokiEnclaveFacade.revokeReadAccess, userDID);
        hasReadAccessAfterRevoke = undefined;
        [error, hasReadAccessAfterRevoke] = await $$.call(lokiEnclaveFacade.hasReadAccess, userDID);
        if (error) {
            throw error;
        }
        assert.false(hasReadAccessAfterRevoke, "User should not have read access");

        testFinishCallback();
    })
}, 60000)
