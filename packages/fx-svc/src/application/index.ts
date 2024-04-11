/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * Crosslake
 - Pedro Sousa Barreto <pedrob@crosslaketech.com>

 --------------
 ******/

"use strict";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJSON = require("../package.json");

import express, {Express} from "express";
import {ExpressRoutes} from "./routes";
import {DefaultLogger} from "@mojaloop/logging-bc-client-lib";
import {ILogger, LogLevel} from "@mojaloop/logging-bc-public-types-lib";

// get configClient from dedicated file
import configClient from "./config";

// constants
const BC_NAME = "foreign-exchange-bc";
const APP_NAME = "fx-svc";
const APP_VERSION = packageJSON.version;
const PRODUCTION_MODE = process.env["PRODUCTION_MODE"] || false;
const LOG_LEVEL: LogLevel = process.env["LOG_LEVEL"] as LogLevel || LogLevel.DEBUG;

// default logger
const logger: ILogger = new DefaultLogger(
    configClient.boundedContextName,
    configClient.applicationName,
    configClient.applicationVersion,
    LOG_LEVEL
);

let app:Express;
let routes: ExpressRoutes;

function setupExpress() {
    app = express();
    app.use(express.json()); // for parsing application/json
    app.use(express.urlencoded({extended: true})); // for parsing application/x-www-form-urlencoded
    logger.info("Express object created and setup");
}

function setupRoutes() {
    routes = new ExpressRoutes(configClient, logger.createChild("expressRoutes"));

    app.use("/", routes.MainRouter);

    // catch all
    app.use((req, res) => { 
        res.send(404); 
    });
    logger.info("Express routes setup");
}

async function start():Promise<void>{
    /// start config client - this is not mockable (can use STANDALONE MODE if desired)
    await configClient.init();
    // send configuration schema to the platform configuration service
    await configClient.bootstrap(true);
    // request current values from the platform configuration service
    await configClient.fetch();

    const httpPortParam = configClient.appConfigs.getParam("service-http-port");
    if(!httpPortParam)
        throw new Error("Missing service-http-port param");

    const httpPort = httpPortParam.currentValue;
    setupExpress();
    setupRoutes();

    /*const server = */app.listen(httpPort, () =>logger.info(`🚀 Example server ready at: http://localhost:${httpPort}`));
}


async function _handle_int_and_term_signals(signal: NodeJS.Signals): Promise<void> {
    logger.info(`Service - ${signal} received - cleaning up...`);
    process.exit();
}

//catches ctrl+c event
process.on("SIGINT", _handle_int_and_term_signals.bind(this));

//catches program termination event
process.on("SIGTERM", _handle_int_and_term_signals.bind(this));

//do something when app is closing
process.on("exit", () => {
    logger.info("Example server - exiting...");
});


start().catch((err:unknown) => {
    logger.fatal(err);
});
