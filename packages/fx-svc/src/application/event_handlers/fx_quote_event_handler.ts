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

* Arg Software
- José Antunes <jose.antunes@arg.software>
- Rui Rocha <rui.rocha@arg.software>

--------------
******/

"use strict";

import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import { MLKafkaJsonConsumerOptions } from "@mojaloop/platform-shared-lib-nodejs-kafka-client-lib";
import { BaseEventHandler, HandlerNames } from "./base_event_handler";
import { IMessage } from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {
    FxQuoteRequestReceivedEvt,
    FxQuoteUnknownErrorEvent,
    FxQuoteUnknownErrorPayload,
    FxQuoteResponseReceivedEvt,
    FxQuoteQueryReceivedEvt,
    FxQuoteRejectReceivedEvt,
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import { FXQuoteAggregate } from "../../domain/aggregates/fx_quote_agg";


export class FXQuoteEventHandler extends BaseEventHandler {
    private _aggregate: FXQuoteAggregate;

    constructor(
        logger: ILogger,
        consumerOptions: MLKafkaJsonConsumerOptions,
        kafkaTopics : string[],
        aggregate: FXQuoteAggregate
    ) {
        super(logger, consumerOptions, kafkaTopics, HandlerNames.FXService);

        this._aggregate = aggregate;
    }

    async processMessage(message: IMessage): Promise<void> {
        this._logger.info(`Got message in FXQuoteEventHandler - msgName: ${message.msgName}`);

        const fspiopOpaqueState = message.fspiopOpaqueState;

        try {
            // Validate message for error
            const errEvent = this._aggregate.validateMessageOrGetErrorEvent(message);
            if (errEvent) {
                await this._aggregate.publishEvent(errEvent, fspiopOpaqueState);
                return;
            }

            switch(message.msgName) {
                case FxQuoteRequestReceivedEvt.name:
                    this._aggregate.handleFxQuoteRequestReceivedEvt(new FxQuoteRequestReceivedEvt(message.payload), fspiopOpaqueState);
                    break;
                case FxQuoteResponseReceivedEvt.name:
                    this._aggregate.handleFxQuoteResponseReceivedEvt(new FxQuoteResponseReceivedEvt(message.payload), fspiopOpaqueState);
                    break;
                case FxQuoteQueryReceivedEvt.name:
                    this._aggregate.handleFxQuoteQueryReceivedEvt(new FxQuoteQueryReceivedEvt(message.payload), fspiopOpaqueState);
                    break;
                case FxQuoteRejectReceivedEvt.name:
                    this._aggregate.handleFxQuoteRejectReceivedEvt(new FxQuoteRejectReceivedEvt(message.payload), fspiopOpaqueState);
                    break;
                default:
                    this._logger.warn(`Cannot handle message of type: ${message.msgName}, ignoring`);
                    break;
            }

        } catch(err: unknown) {
            const errMsg = `Error while handling the event: ${message.msgName}`;
            this._logger.error(errMsg, err);

            // Send back the default error event
            const errPayload: FxQuoteUnknownErrorPayload = {
                requesterFspId: message.fspiopOpaqueState?.requesterFspId ?? null,
                conversionRequestId: message.payload?.conversionRequestId ?? null,
                errorDescription: errMsg
            };
            const errEvent = new FxQuoteUnknownErrorEvent(errPayload);
            await this._aggregate.publishEvent(errEvent, message.fspiopOpaqueState);
        }
    }
}