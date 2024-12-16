const logger = $$.getLogger("LightDBServer", "LokiEnclaveFacade");
const DATABASE = "database";
process.on('uncaughtException', err => {
    logger.critical('There was an uncaught error', err, err.message, err.stack);
});

process.on('SIGTERM', (signal) => {
    process.shuttingDown = true;
    logger.info('Received signal:', signal, ". Activating the gracefulTerminationWatcher.");
});

function LightDBServer(config, callback) {
    let {lightDBStorage, lightDBPort, lightDBDynamicPort, host, sqlConfig} = config;
    const apihubModule = require("apihub");
    const LokiEnclaveFacade = require("loki-enclave-facade");
    const httpWrapper = apihubModule.getHttpWrapper();
    const Server = httpWrapper.Server;
    const CHECK_FOR_RESTART_COMMAND_FILE_INTERVAL = 500;
    //in read-only mode, if the time from the last refresh is bigger than this timeout, then a refresh will be executed
    const LAST_REFRESH_TIMEOUT = 30000;
    const lastRefreshes = {};

    host = host || "127.0.0.1";
    lightDBPort = lightDBPort || 8081;

    const server = new Server();
    server.config = config.serverConfig || config;
    if (!config.storage) {
        config.storage = lightDBStorage;
    }
    const enclaves = {};
    const clonedEnclaves = {};
    const path = require("path");
    const fs = require("fs");
    try {
        fs.accessSync(lightDBStorage);
        const folderContent = fs.readdirSync(lightDBStorage, {withFileTypes: true});
        for (let entry of folderContent) {
            if (entry.isDirectory()) {
                let enclaveName = entry.name;
                logger.info(`Loading database ${enclaveName}`);
                if (sqlConfig) {
                    const SQLAdapter = require("lightDB-sql-adapter");
                    enclaves[enclaveName] = SQLAdapter.createSQLAdapterInstance({
                        ...sqlConfig,
                        database: enclaveName  // Use the enclave name as the database name
                    });
                    clonedEnclaves[enclaveName] = SQLAdapter.createSQLAdapterInstance({
                        ...sqlConfig,
                        database: enclaveName
                    });
                } else {
                    // For LokiDB, use the original filesystem-based approach
                    enclaves[enclaveName] = LokiEnclaveFacade.createLokiEnclaveFacadeInstance(path.join(lightDBStorage, enclaveName, DATABASE));
                    clonedEnclaves[enclaveName] = LokiEnclaveFacade.createLokiEnclaveFacadeInstance(path.join(lightDBStorage, enclaveName, DATABASE));
                }
            }
        }
    } catch (err) {
        logger.info(`Failed to access the storage folder: ${lightDBStorage}. Ensuring folder structure...`);
        fs.mkdirSync(lightDBStorage, {recursive: true});
    }

    let accessControlAllowHeaders = new Set();
    accessControlAllowHeaders.add("Content-Type");
    accessControlAllowHeaders.add("Content-Length");
    accessControlAllowHeaders.add("X-Content-Length");
    accessControlAllowHeaders.add("Access-Control-Allow-Origin");
    accessControlAllowHeaders.add("User-Agent");
    accessControlAllowHeaders.add("Authorization");

    let listenCallback = (err) => {
        if (err) {
            if (lightDBDynamicPort && err.code === 'EADDRINUSE') {
                logger.debug("Failed to listen on port <" + lightDBPort + ">", err);

                function getRandomPort() {
                    const min = 9000;
                    const max = 65535;
                    return Math.floor(Math.random() * (max - min) + min);
                }

                lightDBPort = getRandomPort();
                if (Number.isInteger(lightDBDynamicPort)) {
                    lightDBDynamicPort -= 1;
                }
                setTimeout(boot, CHECK_FOR_RESTART_COMMAND_FILE_INTERVAL);
                return
            }
            logger.error(err);
            if (!lightDBDynamicPort && callback) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to listen on port <${lightDBPort}>`, err));
            }
        }
    };

    function bindFinished(err) {
        if (err) {
            logger.error(err);
            if (callback) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to bind on port <${lightDBPort}>`, err));
            }
            return;
        }

        process.env.LIGHT_DB_SERVER_ADDRESS = `http://${host}:${lightDBPort}`;
        logger.info(`LightDB server running at port: ${lightDBPort}`);
        registerEndpoints();
        if (callback) {
            callback(undefined, server);
        }
    }

    function boot() {
        logger.debug(`Trying to listen on port ${lightDBPort}`);
        server.listen(lightDBPort, host, listenCallback);
    }

    boot();

    server.on('listening', bindFinished);
    server.on('error', listenCallback);

    function registerEndpoints() {
        server.getAccessControlAllowHeadersAsString = function () {
            let headers = "";
            let notFirst = false;
            for (let header of accessControlAllowHeaders) {
                if (notFirst) {
                    headers += ", ";
                }
                notFirst = true;
                headers += header;
            }
            return headers;
        }

        server.use(function gracefulTerminationWatcher(req, res, next) {
            if (process.shuttingDown) {
                //uncaught exception was caught so server is shutting down gracefully and not accepting any requests
                res.statusCode = 503;
                logger.log(0x02, `Rejecting ${req.url} with status code ${res.statusCode} because process is shutting down.`);
                res.end();
                return;
            }
            //if the shuttingDown flag not present, we let the request go on...
            next();
        });


        server.use(function (req, res, next) {
            res.setHeader('Access-Control-Allow-Origin', req.headers.origin || req.headers.host || "*");
            res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', server.getAccessControlAllowHeadersAsString());
            res.setHeader('Access-Control-Allow-Credentials', true);
            next();
        });

        //we activate the readOnly without the server.use handler becase we expose only PUT type of http methods
        apihubModule.middlewares.ReadOnly(server, false);

        server.put(`/executeCommand/:dbName`, (req, res, next) => {
            const {dbName} = req.params;
            if (!enclaves[dbName]) {
                res.statusCode = 400;
                res.write(`No db with name ${dbName} was found!`);
                res.end();
                return;
            }
            httpWrapper.httpUtils.bodyParser(req, res, next);
        });

        server.put(`/executeCommand/:dbName`, function (req, res) {
            let body = req.body;
            try {
                body = JSON.parse(body);
            } catch (e) {
                logger.error("Invalid body", body);
                res.statusCode = 400;
                res.write("Invalid body");
                return res.end();
            }

            if (typeof body.command !== "string") {
                logger.error("Invalid command", body.command);
                res.statusCode = 400;
                res.write("Invalid command");
                return res.end();
            }

            let command;
            try {
                command = JSON.parse(body.command);
            } catch (e) {
                logger.error("Invalid command", command);
                res.statusCode = 400;
                res.write("Invalid command");
                return res.end();
            }

            const didAPI = require("opendsu").loadAPI("w3cdid");
            const args = command.params;
            if (!Array.isArray(args)) {
                logger.error("Invalid args", args);
                return res.send(400, "Invalid args");
            }

            let didDocument;
            const __verifySignatureAndExecuteCommand = () => {
                didDocument.verify(body.command, $$.Buffer.from(body.signature, "base64"), async (err, result) => {
                    if (err) {
                        logger.error(`Failed to verify signature`, err);
                        res.statusCode = 500;
                        res.write(`Failed to verify signature`);
                        return res.end();
                    }

                    if (!result) {
                        logger.error(`Invalid signature`);
                        res.statusCode = 500;
                        res.write(`Invalid signature`);
                        return res.end();
                    }

                    if (server.readOnlyModeActive) {
                        if (enclaves[req.params.dbName].allowedInReadOnlyMode &&
                            !enclaves[req.params.dbName].allowedInReadOnlyMode(command.commandName)) {

                            res.statusCode = 403;
                            res.end();
                            return;
                        }

                        //at this point we know that will execute a read cmd so first of all we need to ensure that a refresh is made if needed
                        try {
                            let lastRefresh = lastRefreshes[req.params.dbName];
                            if (!lastRefresh || LAST_REFRESH_TIMEOUT < Date.now() - lastRefresh) {
                                enclaves[req.params.dbName].refresh(undefined, (err) => {
                                    clonedEnclaves[req.params.dbName].refresh(undefined, (err) => {
                                        lastRefreshes[req.params.dbName] = Date.now();
                                    });
                                });
                            }
                        } catch (err) {
                            //we ignore any refresh errors for now...
                        }
                    }

                    const cb = (err, result) => {
                        if (err) {
                            res.statusCode = 500;
                            logger.debug(`Error while executing command ${command.commandName}`, err);
                            res.write(`Error while executing command`);
                            return res.end();
                        }

                        res.statusCode = 200;
                        if (typeof result !== "undefined") {
                            res.write(JSON.stringify(result));
                        }

                        res.end();
                    }

                    args.push(cb);

                    // trying to capture any sync error that might occur during the execution of the command
                    try {
                        if (enclaves[req.params.dbName].refreshInProgress()) {
                            clonedEnclaves[req.params.dbName][command.commandName](...args);
                        } else {
                            enclaves[req.params.dbName][command.commandName](...args);
                        }
                    } catch (e) {
                        cb(e);
                    }
                });
            }
            if (args[0] === $$.SYSTEM_IDENTIFIER) {
                didDocument = $$.SYSTEM_DID_DOCUMENT;
                return __verifySignatureAndExecuteCommand();
            }

            didAPI.resolveDID(args[0], (err, _didDocument) => {
                if (err) {
                    logger.error(`Failed to resolve DID ${args[0]}`, err);
                    res.statusCode = 500;
                    res.write(`Failed to resolve DID`);
                    return res.end();
                }

                didDocument = _didDocument;
                __verifySignatureAndExecuteCommand();
            });
        });

        server.put(`/createDatabase/:dbName`, function (req, res) {
            const {dbName} = req.params;
            if (enclaves[dbName]) {
                res.statusCode = 409;
                res.write("Already exists");
                res.end();
                return;
            }

            const storage = path.join(lightDBStorage, dbName);
            logger.info(`Creating new Database at ${storage}`);
            let fsModule = "fs";
            fsModule = require(fsModule);
            fsModule.mkdir(storage, {recursive: true}, (err) => {
                if (err) {
                    logger.error("Failed to create database", err);
                    res.statusCode = 500;
                    res.end();
                    return;
                }
                if (enclaves[dbName]) {
                    logger.error("Race condition detected and resolved during lightDB database creation");
                    res.statusCode = 409;
                    res.write("Already exists");
                    return res.end();
                }
                enclaves[dbName] = LokiEnclaveFacade.createLokiEnclaveFacadeInstance(path.join(storage, DATABASE));
                res.statusCode = 201;
                res.end();
            })
        });
    }
}

module.exports = LightDBServer;