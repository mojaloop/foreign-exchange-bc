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

import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import { 
    MLKafkaJsonProducer,
} from "@mojaloop/platform-shared-lib-nodejs-kafka-client-lib";
import {
    FxQueryReceivedEvt,
    FxQueryResponseEvtPayload,
    FxQueryResponseEvt,
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import { IParticipantsServiceAdapter } from "../../domain/interfaces";
import { ParticipantTypes } from "@mojaloop/participant-bc-public-types-lib";


export class FXSvcAggregate {
    private _logger: ILogger;
    private _messageProducer: MLKafkaJsonProducer;
    private _participantService: IParticipantsServiceAdapter;

    constructor(
        logger: ILogger,
        messageProducer: MLKafkaJsonProducer,
        participantService: IParticipantsServiceAdapter
    ) {
        this._logger = logger;
        this._messageProducer = messageProducer;
        this._participantService = participantService;
    }

    async handleFxQueryReceivedEvt(message: FxQueryReceivedEvt): Promise<void> {
        try {
            message.validatePayload();

            const participants = await this._participantService.getAllParticipants();

            // Filter out participants that provide FX service
            let providers: string[];
            if (!participants) {
                providers = [];
            } else {
                const fxpList = participants.filter((participant) => {
                    return participant.type === ParticipantTypes.FXP;
                });

                providers = fxpList.map((fxp) => {
                    return fxp.name;
                });
            }

            // Send the payload to kafka
            const payload: FxQueryResponseEvtPayload = {
                requesterFspId: message.payload.requesterFspId,
                providers: providers
            };
            await this._messageProducer.send(new FxQueryResponseEvt(payload));

        } catch(err: unknown) {
            this._logger.error(err, "_handleFxQueryReceivedEvt -> error");
            throw new Error("_handleFxQueryReceivedEvt -> error");
        }
    }
}