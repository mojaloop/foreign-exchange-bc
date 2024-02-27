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
    FxQuoteRequestReceivedEvt,
    FxQuoteInvalidMessagePayloadErrorPayload,
    FxQuoteInvalidMessagePayloadErrorEvent,
    FxQuoteInvalidMessageTypeErrorPayload,
    FxQuoteInvalidMessageTypeErrorEvent,
    FxQuoteInvalidRequesterParticipantErrorPayload,
    FxQuoteInvalidRequesterParticipantErrorEvent,
    FxQuoteRequesterParticipantNotFoundErrorEvtPayload,
    FxQuoteRequesterParticipantNotFoundErrorEvt,
    FxQuoteRequiredRequesterParticipantIsNotApprovedErrorEvtPayload,
    FxQuoteRequiredRequesterParticipantIsNotApprovedErrorEvt,
    FxQuoteRequiredRequesterParticipantIsNotActiveErrorEvtPayload,
    FxQuoteRequiredRequesterParticipantIsNotActiveErrorEvt,
    FxQuoteInvalidDestinationParticipantErrorPayload,
    FxQuoteInvalidDestinationParticipantErrorEvent,
    FxQuoteDestinationParticipantNotFoundErrorEvtPayload,
    FxQuoteDestinationParticipantNotFoundErrorEvt,
    FxQuoteRequiredDestinationParticipantIsNotApprovedErrorEvtPayload,
    FxQuoteRequiredDestinationParticipantIsNotApprovedErrorEvt,
    FxQuoteRequiredDestinationParticipantIsNotActiveErrorEvtPayload,
    FxQuoteRequiredDestinationParticipantIsNotActiveErrorEvt,
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import { IMessage, DomainEventMsg, MessageTypes } from "@mojaloop/platform-shared-lib-messaging-types-lib";
import { IParticipant } from "@mojaloop/participant-bc-public-types-lib";
import { IParticipantsServiceAdapter } from "../../domain/interfaces";


export class FXQuoteAggregate {
    private _logger: ILogger;
    private _messageProducer: MLKafkaJsonProducer;
    private _participantService: IParticipantsServiceAdapter;

    constructor(
        logger: ILogger,
        messageProducer: MLKafkaJsonProducer,
        participantService: IParticipantsServiceAdapter,
    ) {
        this._logger = logger;
        this._messageProducer = messageProducer;
        this._participantService = participantService;
    }

    async handleFxQuoteRequestReceivedEvt(message: FxQuoteRequestReceivedEvt): Promise<void> {
        const conversionRequestId = message.payload.conversionRequestId;
        this._logger.info(`Started handling the event - ${message.msgName} with conversionRequestId: ${conversionRequestId}`);

        const fspiopOpaqueState = message.fspiopOpaqueState;
        const requesterFspId = message.payload.conversionTerms?.initiatingFsp ?? fspiopOpaqueState.requesterFspId ?? null;
        const destinationFspId = message.payload.conversionTerms?.counterPartyFsp ?? fspiopOpaqueState.destinationFspId ?? null;
        const expirationDate = message.payload.conversionTerms?.expiration ?? null;

        let eventToPublish: DomainEventMsg | null;

        try {
            message.validatePayload();

            // ToDo: Check supported currencies for both source and target

            eventToPublish = await this.validateRequesterFsp(requesterFspId, conversionRequestId);
            if (eventToPublish) {
                // Send the error event
                await this.publishEvent(eventToPublish, fspiopOpaqueState);
                return;
            }

            eventToPublish = await this.validateDestinationFsp(destinationFspId, conversionRequestId);
            if (eventToPublish) {
                // Send the error event
                await this.publishEvent(eventToPublish, fspiopOpaqueState);
                return;
            }
            

        } catch(err: unknown) {
            this._logger.error(err);
            throw new Error(`handleFxQuoteRequestReceivedEvt -> ${(err as Error).message}`);
        }
    }

    async validateMessageOrGetErrorEvent(message: IMessage): Promise<void> {
		const requesterFspId = message.payload?.requesterFspId ?? null;
        const conversionRequestId = message.payload?.conversionRequestId ?? null;
        const fspiopOpaqueState = message.fspiopOpaqueState;

        let errEvt: DomainEventMsg | null = null;
        let errorMessage: string = "";

		if (!message.payload) {
			errorMessage = "Message payload is null or undefined";

			const errPayload: FxQuoteInvalidMessagePayloadErrorPayload = {
                conversionRequestId: conversionRequestId,
				requesterFspId: requesterFspId,
				errorDescription: errorMessage,
			};

			errEvt = new FxQuoteInvalidMessagePayloadErrorEvent(errPayload);

		} else if (message.msgType !== MessageTypes.DOMAIN_EVENT) {
			errorMessage = `Message type is invalid ${message.msgType}`;

			const errPayload: FxQuoteInvalidMessageTypeErrorPayload = {
                conversionRequestId: conversionRequestId,
				requesterFspId: requesterFspId,
				errorDescription: errorMessage,
			};

			errEvt = new FxQuoteInvalidMessageTypeErrorEvent(errPayload);
		}

		if (errEvt) {
            errEvt.fspiopOpaqueState = fspiopOpaqueState;
            await this._messageProducer.send(errEvt);

            throw new Error(errorMessage);
        }
    }

    private async validateRequesterFsp(
        participantId: string,
        conversionRequestId: string
    ): Promise<DomainEventMsg | null> {
        let participant: IParticipant | null = null;

        if(!participantId) {
            const errorMessage = "initiatingFspId is null or undefined";
			this._logger.error(errorMessage);

            const errPayload: FxQuoteInvalidRequesterParticipantErrorPayload = {
                conversionRequestId: conversionRequestId,
                requesterFspId: participantId,
                errorDescription: errorMessage
            };
            const errEvent = new FxQuoteInvalidRequesterParticipantErrorEvent(errPayload);
            return errEvent;
        }

        participant = await this._participantService.getParticipantInfo(participantId).catch((err: unknown) => {
            this._logger.error(`Error getting payer info for fspId: ${participantId} - ${(err as Error).message}`);
            return null;
        });

        if(!participant) {
            const errorMessage = `Payer participant not found for fspId: ${participantId}`;
            this._logger.error(errorMessage);

            const errPayload: FxQuoteRequesterParticipantNotFoundErrorEvtPayload = {
                conversionRequestId: conversionRequestId,
                requesterFspId: participantId,
                errorDescription: errorMessage
            };
            const errEvent = new FxQuoteRequesterParticipantNotFoundErrorEvt(errPayload);
            return errEvent;
        }

        if(!participant.approved) {
            const errorMessage = `Payer participant fspId ${participantId} is not approved`;
			this._logger.error(errorMessage);

            const errPayload: FxQuoteRequiredRequesterParticipantIsNotApprovedErrorEvtPayload = {
                conversionRequestId: conversionRequestId,
                requesterFspId: participantId,
                errorDescription: errorMessage
            };
            const errEvent = new FxQuoteRequiredRequesterParticipantIsNotApprovedErrorEvt(errPayload);
            return errEvent;
        }

        if(!participant.isActive) {
            const errorMessage = `Payer participant fspId ${participantId} is not active`;
			this._logger.error(errorMessage);

            const errPayload: FxQuoteRequiredRequesterParticipantIsNotActiveErrorEvtPayload = {
                conversionRequestId: conversionRequestId,
                requesterFspId: participantId,
                errorDescription: errorMessage
            };
            const errEvent = new FxQuoteRequiredRequesterParticipantIsNotActiveErrorEvt(errPayload);
            return errEvent;
        }

        return null;
    }

    private async validateDestinationFsp(
        participantId: string,
        conversionRequestId: string
    ): Promise<DomainEventMsg | null> {
        let participant: IParticipant | null = null;

        if(!participantId) {
            const errorMessage = "counterPartyFspId is null or undefined";
			this._logger.error(errorMessage);

            const errPayload: FxQuoteInvalidDestinationParticipantErrorPayload = {
                conversionRequestId: conversionRequestId,
                destinationFspId: participantId,
                errorDescription: errorMessage
            };
            const errEvent = new FxQuoteInvalidDestinationParticipantErrorEvent(errPayload);
            return errEvent;
        }

        participant = await this._participantService.getParticipantInfo(participantId).catch((err: unknown) => {
            this._logger.error(`Error getting FXP info for fspId: ${participantId} - ${(err as Error).message}`);
            return null;
        });

        if(!participant) {
            const errorMessage = `FXP not found for fspId: ${participantId}`;
            this._logger.error(errorMessage);

            const errPayload: FxQuoteDestinationParticipantNotFoundErrorEvtPayload = {
                conversionRequestId: conversionRequestId,
                destinationFspId: participantId,
                errorDescription: errorMessage
            };
            const errEvent = new FxQuoteDestinationParticipantNotFoundErrorEvt(errPayload);
            return errEvent;
        }

        if(!participant.approved) {
            const errorMessage = `FXP fspId ${participantId} is not approved`;
			this._logger.error(errorMessage);

            const errPayload: FxQuoteRequiredDestinationParticipantIsNotApprovedErrorEvtPayload = {
                conversionRequestId: conversionRequestId,
                destinationFspId: participantId,
                errorDescription: errorMessage
            };
            const errEvent = new FxQuoteRequiredDestinationParticipantIsNotApprovedErrorEvt(errPayload);
            return errEvent;
        }

        if(!participant.isActive) {
            const errorMessage = `FXP fspId ${participantId} is not active`;
			this._logger.error(errorMessage);

            const errPayload: FxQuoteRequiredDestinationParticipantIsNotActiveErrorEvtPayload = {
                conversionRequestId: conversionRequestId,
                destinationFspId: participantId,
                errorDescription: errorMessage
            };
            const errEvent = new FxQuoteRequiredDestinationParticipantIsNotActiveErrorEvt(errPayload);
            return errEvent;
        }

        return null;
    }

    async publishEvent(event: DomainEventMsg, fspiopOpaqueState: any): Promise<void> {
        event.fspiopOpaqueState = fspiopOpaqueState;
        await this._messageProducer.send(event);
        this._logger.info(`Sent message with the event - ${event.msgName}`);
    }
}