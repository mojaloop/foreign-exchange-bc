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

* Arg Software
- José Antunes <jose.antunes@arg.software>
- Rui Rocha <rui.rocha@arg.software>

--------------
******/

"use strict";

import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import { IMessage } from "@mojaloop/platform-shared-lib-messaging-types-lib";
import { 
    MLKafkaJsonConsumer,
    MLKafkaJsonConsumerOptions,
} from "@mojaloop/platform-shared-lib-nodejs-kafka-client-lib";
import { FXSvcAggregate } from "../../domain/aggregates/fx_svc_agg";


export const HandlerNames = {
    FXService: "FXServiceEventHandler",
};

export abstract class BaseEventHandler  {
    protected readonly _logger: ILogger;
    protected readonly _consumerOpts: MLKafkaJsonConsumerOptions;
    protected readonly _kafkaTopics: string[];
    protected readonly _kafkaConsumer: MLKafkaJsonConsumer;
    protected readonly _handlerName: string;
    protected readonly _fxSvcAggregate: FXSvcAggregate;

    constructor(
        logger: ILogger,
        consumerOptions: MLKafkaJsonConsumerOptions,
        kafkaTopics : string[],
        handlerName: string,
        fxSvcAggregate: FXSvcAggregate
    ) {
        this._logger = logger.createChild(this.constructor.name);
        this._consumerOpts = consumerOptions;
        this._kafkaTopics = kafkaTopics;
        this._handlerName = handlerName;
        this._fxSvcAggregate = fxSvcAggregate;

        this._kafkaConsumer = new MLKafkaJsonConsumer(this._consumerOpts, this._logger);
    }

    async init () : Promise<void> {
        this._logger.info("Event handler starting...");
        try {
            this._kafkaConsumer.setTopics(this._kafkaTopics);
            this._kafkaConsumer.setCallbackFn(this.processMessage.bind(this));
            await this._kafkaConsumer.connect();
            await this._kafkaConsumer.startAndWaitForRebalance();

            this._logger.info("Event handler started.");
            
        } catch(error: unknown) {
            this._logger.error(`Error initializing ${this._handlerName} handler: ${(error as Error).message}`);
            throw new Error(`Error initializing ${this._handlerName}`);
        }
    }

    async destroy(): Promise<void> {
        await this._kafkaConsumer.destroy(true);
    }

    abstract processMessage(sourceMessage: IMessage): Promise<void>;
}
