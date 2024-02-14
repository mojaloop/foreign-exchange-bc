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
import {existsSync} from "fs";

import {KafkaLogger} from "@mojaloop/logging-bc-client-lib";
import {ILogger, LogLevel} from "@mojaloop/logging-bc-public-types-lib";
import {
    MLKafkaJsonConsumer, 
    MLKafkaJsonConsumerOptions, 
    MLKafkaJsonProducer, 
    MLKafkaJsonProducerOptions
} from "@mojaloop/platform-shared-lib-nodejs-kafka-client-lib";
import {
    DefaultConfigProvider,
    IConfigProvider
} from "@mojaloop/platform-configuration-bc-client-lib";
import {
    AuthenticatedHttpRequester,
} from "@mojaloop/security-bc-client-lib";
import {
    AuditClient,
    KafkaAuditClientDispatcher,
    LocalAuditClientCryptoProvider
} from "@mojaloop/auditing-bc-client-lib";

import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";
import {IMessageConsumer, IMessageProducer} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {IConfigurationClient} from "@mojaloop/platform-configuration-bc-public-types-lib";
import {IMetrics} from "@mojaloop/platform-shared-lib-observability-types-lib";
import {PrometheusMetrics} from "@mojaloop/platform-shared-lib-observability-client-lib";

import {Server} from "net";
import * as util from "util";

// get configClient from dedicated file
import { GetFXConfigSet } from "./config";


// constants
const BC_NAME = "foreign-exchange-bc";
const APP_NAME = "fx-svc";
const APP_VERSION = packageJSON.version;
// configs - non-constants
const ENV_NAME = process.env["ENV_NAME"] || "dev";

const PRODUCTION_MODE = process.env["PRODUCTION_MODE"] || false;
const LOG_LEVEL: LogLevel = process.env["LOG_LEVEL"] as LogLevel || LogLevel.DEBUG;

const SERVICE_START_TIMEOUT_MS= (process.env["SERVICE_START_TIMEOUT_MS"] && parseInt(process.env["SERVICE_START_TIMEOUT_MS"])) || 60_000;

const KAFKA_URL = process.env["KAFKA_URL"] || "localhost:9092";
const MONGO_URL = process.env["MONGO_URL"] || "mongodb://root:example@localhost:27017/";

const AUTH_N_SVC_BASEURL = process.env["AUTH_N_SVC_BASEURL"] || "http://localhost:3201";
// TODO this should not be known here, libs that use the base should add the suffix
const AUTH_N_SVC_TOKEN_URL = AUTH_N_SVC_BASEURL + "/token";

const SVC_CLIENT_ID = process.env["SVC_CLIENT_ID"] || "participants-bc-participants-svc";
const SVC_CLIENT_SECRET = process.env["SVC_CLIENT_SECRET"] || "superServiceSecret";

const KAFKA_AUDITS_TOPIC = process.env["KAFKA_AUDITS_TOPIC"] || "audits";
const KAFKA_LOGS_TOPIC = process.env["KAFKA_LOGS_TOPIC"] || "logs";
const AUDIT_KEY_FILE_PATH = process.env["AUDIT_KEY_FILE_PATH"] || "/app/data/audit_private_key.pem";

const SVC_DEFAULT_HTTP_PORT = 3010;

// Kafka options
const kafkaProducerOptions = {
    kafkaBrokerList: KAFKA_URL
};
const kafkaConsumerOptions: MLKafkaJsonConsumerOptions = {
    kafkaBrokerList: KAFKA_URL,
    kafkaGroupId: `${BC_NAME}_${APP_NAME}`
};

let globalLogger: ILogger;


export class Service {
    static app: Express;
    static expressServer: Server;
    static logger: ILogger;
    static auditClient: IAuditClient;
    static messageProducer: IMessageProducer;
    static messageConsumer: IMessageConsumer;
    static configClient: IConfigurationClient;
    static startupTimer: NodeJS.Timeout;
    static metrics: IMetrics;

    static async start(
        logger?: ILogger,
        configProvider?: IConfigProvider,
        auditClient?: IAuditClient,
        messageProducer?: IMessageProducer,
        messageConsumer?: IMessageConsumer,
        configClient?: IConfigurationClient,
        startupTimer?: NodeJS.Timeout,
        metrics?: IMetrics,
    ): Promise<void> {
        console.log(`Service starting with PID: ${process.pid}`);

        this.startupTimer = setTimeout(()=>{
            throw new Error("Service start timed-out");
        }, SERVICE_START_TIMEOUT_MS);

        if (!logger) {
            logger = new KafkaLogger(
                BC_NAME,
                APP_NAME,
                APP_VERSION,
                kafkaProducerOptions,
                KAFKA_LOGS_TOPIC,
                LOG_LEVEL
            );
            await (logger as KafkaLogger).init();
        }
        globalLogger = this.logger = logger;

        /// start config client - this is not mockable (can use STANDALONE MODE if desired)
        if(!configProvider) {
            // create the instance of IAuthenticatedHttpRequester
            const authRequester = new AuthenticatedHttpRequester(logger, AUTH_N_SVC_TOKEN_URL);
            authRequester.setAppCredentials(SVC_CLIENT_ID, SVC_CLIENT_SECRET);

            const messageConsumer = new MLKafkaJsonConsumer({
                kafkaBrokerList: KAFKA_URL,
                kafkaGroupId: `${APP_NAME}_${Date.now()}` // unique consumer group - use instance id when possible
            }, this.logger.createChild("configClient.consumer"));
            configProvider = new DefaultConfigProvider(logger, authRequester, messageConsumer);
        }
        this.configClient = GetFXConfigSet(configProvider, BC_NAME, APP_NAME, APP_VERSION);
        await this.configClient.init();
        await this.configClient.bootstrap(true);
        await this.configClient.fetch();

        // start auditClient
        if (!auditClient) {
            if (!existsSync(AUDIT_KEY_FILE_PATH)) {
                if (PRODUCTION_MODE) process.exit(9);
                // create e tmp file
                LocalAuditClientCryptoProvider.createRsaPrivateKeyFileSync(AUDIT_KEY_FILE_PATH, 2048);
            }
            const auditLogger = logger.createChild("AuditLogger");
            auditLogger.setLogLevel(LogLevel.INFO);
            const cryptoProvider = new LocalAuditClientCryptoProvider(AUDIT_KEY_FILE_PATH);
            const auditDispatcher = new KafkaAuditClientDispatcher(kafkaProducerOptions, KAFKA_AUDITS_TOPIC, auditLogger);
            // NOTE: to pass the same kafka logger to the audit client, make sure the logger is started/initialised already
            auditClient = new AuditClient(BC_NAME, APP_NAME, APP_VERSION, cryptoProvider, auditDispatcher);
            await auditClient.init();
        }
        this.auditClient = auditClient;

        if(!metrics){
            const labels: Map<string, string> = new Map<string, string>();
            labels.set("bc", BC_NAME);
            labels.set("app", APP_NAME);
            labels.set("version", APP_VERSION);
            PrometheusMetrics.Setup({prefix:"", defaultLabels: labels}, this.logger);
            metrics = PrometheusMetrics.getInstance();
        }
        this.metrics = metrics;

        if (!messageProducer) {
            const producerLogger = logger.createChild("producerLogger");
            producerLogger.setLogLevel(LogLevel.INFO);
            messageProducer = new MLKafkaJsonProducer(kafkaProducerOptions, producerLogger);
            await messageProducer.connect();
        }
        this.messageProducer = messageProducer;

        if(!messageConsumer){
            const consumerHandlerLogger = logger.createChild("handlerConsumer");
            consumerHandlerLogger.setLogLevel(LogLevel.INFO);
            messageConsumer = new MLKafkaJsonConsumer(kafkaConsumerOptions, consumerHandlerLogger);
        }
        this.messageConsumer = messageConsumer;

        // Initiate event handlers
        

        await this.setupExpress();

        // remove startup timeout
        clearTimeout(this.startupTimer);
    }

    static setupExpress(): Promise<void> {
        return new Promise<void>(resolve => {
            this.app = express();
            this.app.use(express.json()); // for parsing application/json
            this.app.use(express.urlencoded({extended: true})); // for parsing application/x-www-form-urlencoded

            const routes = new ExpressRoutes(this.configClient, this.logger);

            // Add health and metrics http routes - before others (to avoid authZ middleware)
            this.app.get("/health", (req: express.Request, res: express.Response) => {
                return res.send({ status: "OK" });
            });
            this.app.get("/metrics", async (req: express.Request, res: express.Response) => {
                const strMetrics = await (this.metrics as PrometheusMetrics).getMetricsForPrometheusScrapper();
                return res.send(strMetrics);
            });

            // app routes
            this.app.use("/", routes.MainRouter);

            this.app.use((req, res) => {
                // catch all
                res.send(404);
            });

            let portNum = SVC_DEFAULT_HTTP_PORT;
            if (process.env["SVC_HTTP_PORT"] && !isNaN(parseInt(process.env["SVC_HTTP_PORT"]))) {
                portNum = parseInt(process.env["SVC_HTTP_PORT"]);
            }

            this.expressServer = this.app.listen(portNum, () => {
                this.logger.info(`🚀 Server ready at port: ${portNum}`);
                this.logger.info(`Participants service v: ${APP_VERSION} started`);
                resolve();
            });
        });
    }

    static async stop() {
        if (this.expressServer){
            const closeExpress = util.promisify(this.expressServer.close.bind(this.expressServer));
            await closeExpress();
        }
        if (this.messageProducer) await this.messageProducer.destroy();
        if (this.auditClient) await this.auditClient.destroy();
        // if (this.accountsBalancesAdapter) await this.accountsBalancesAdapter.destroy();
        if (this.logger && this.logger instanceof KafkaLogger) await this.logger.destroy();
    }
}


/**
 * process termination and cleanup
 */

async function _handle_int_and_term_signals(signal: NodeJS.Signals): Promise<void> {
    console.info(`Service - ${signal} received - cleaning up...`);
    let clean_exit = false;
    setTimeout(() => {
        clean_exit || process.exit(99);
    }, 5000);

    // call graceful stop routine
    await Service.stop();

    clean_exit = true;
    process.exit();
}

//catches ctrl+c event
process.on("SIGINT", _handle_int_and_term_signals);
//catches program termination event
process.on("SIGTERM", _handle_int_and_term_signals);

//do something when app is closing
process.on("exit", async () => {
    globalLogger.info("Microservice - exiting...");
});
process.on("uncaughtException", (err: Error) => {
    globalLogger.error(err);
    console.log("UncaughtException - EXITING...");
    process.exit(999);
});
