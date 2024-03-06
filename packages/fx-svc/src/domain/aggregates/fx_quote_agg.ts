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
    FxQuoteBCQuoteRuleSchemeViolatedRequestErrorEvtPayload,
    FxQuoteBCQuoteRuleSchemeViolatedRequestErrorEvt,
    FxQuoteBcQuoteExpiredErrorEvtPayload,
    FxQuoteBcQuoteExpiredErrorEvt,
    FxQuoteUnableToAddQuoteToDatabaseErrorEvtPayload,
    FxQuoteUnableToAddQuoteToDatabaseErrorEvt,
    FxQuoteRequestAcceptedEvtPayload,
    FxQuoteRequestAcceptedEvt,
    FxQuoteBCQuoteRuleSchemeViolatedResponseErrorEvtPayload,
    FxQuoteBCQuoteRuleSchemeViolatedResponseErrorEvt,
    FxQuoteResponseReceivedEvt,
    FxQuoteUnableToUpdateQuoteToDatabaseErrorEvtPayload,
    FxQuoteUnableToUpdateQuoteToDatabaseErrorEvt,
    FxQuoteResponseAcceptedEvtPayload,
    FxQuoteResponseAcceptedEvt,
    FxQuoteQueryReceivedEvt,
    FxQuoteBCQuoteNotFoundErrorEvtPayload,
    FxQuoteBCQuoteNotFoundErrorEvt,
    FxQuoteQueryRespondedEvtPayload,
    FxQuoteQueryRespondedEvt,
    FxQuoteRejectReceivedEvt,
    FxQuoteRejectRespondedEvtPayload,
    FxQuoteRejectRespondedEvt,
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import { IMessage, DomainEventMsg, MessageTypes } from "@mojaloop/platform-shared-lib-messaging-types-lib";
import { IParticipant } from "@mojaloop/participant-bc-public-types-lib";
import { IParticipantsServiceAdapter } from "../../domain/interfaces";
import { IFxQuoteRepo } from "../interfaces";
import { IFxQuote, IFxQuoteSchemeRules, FxQuoteStatus } from "../types";


export class FXQuoteAggregate {
    private _logger: ILogger;
    private _fxQuotesRepo: IFxQuoteRepo;
    private _messageProducer: MLKafkaJsonProducer;
    private _participantService: IParticipantsServiceAdapter;
    private _schemeRules: IFxQuoteSchemeRules;
    private _passThroughMode: boolean;

    constructor(
        logger: ILogger,
        fxQuotesRepo: IFxQuoteRepo,
        messageProducer: MLKafkaJsonProducer,
        participantService: IParticipantsServiceAdapter,
        schemeRules: IFxQuoteSchemeRules,
        passThroughMode: boolean,
    ) {
        this._logger = logger;
        this._fxQuotesRepo = fxQuotesRepo;
        this._messageProducer = messageProducer;
        this._participantService = participantService;
        this._schemeRules = schemeRules;
        this._passThroughMode = passThroughMode;
    }

    async handleFxQuoteRequestReceivedEvt(message: FxQuoteRequestReceivedEvt): Promise<void> {
        message.validatePayload();

        const conversionRequestId = message.payload.conversionRequestId;
        this._logger.info(`Started handling the event - ${message.msgName} with conversionRequestId: ${conversionRequestId}`);

        const fspiopOpaqueState = message.fspiopOpaqueState;
        const requesterFspId = message.payload.conversionTerms?.initiatingFsp ?? fspiopOpaqueState.requesterFspId ?? null;
        const destinationFspId = message.payload.conversionTerms?.counterPartyFsp ?? fspiopOpaqueState.destinationFspId ?? null;
        const expirationDate = message.payload.conversionTerms?.expiration ?? null;

        let eventToPublish: DomainEventMsg | null = null;

        // Check supported currencies for both source and target
        const isSchemeValid = this.validateScheme(message);
        if (!isSchemeValid) {
            const errPayload: FxQuoteBCQuoteRuleSchemeViolatedRequestErrorEvtPayload = {
                conversionRequestId: conversionRequestId,
                errorDescription: `FxQuote request scheme validation failed for : ${conversionRequestId}`,
            };

            eventToPublish = new FxQuoteBCQuoteRuleSchemeViolatedRequestErrorEvt(errPayload);
            return await this.publishEvent(eventToPublish, fspiopOpaqueState);
        }

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
        
        if (expirationDate) {
            eventToPublish = this.validateFxQuoteExpirationDate(conversionRequestId, expirationDate);
            if (eventToPublish) {
                // Send the error event
                await this.publishEvent(eventToPublish, fspiopOpaqueState);
                return;
            }
        }

        const now = Date.now();

        const fxQuote: IFxQuote = {
            createdAt: now,
            updatedAt: now,
            conversionRequestId: message.payload.conversionRequestId,
            conversionTerms: message.payload.conversionTerms,
            condition: null,
            status: FxQuoteStatus.PENDING,
            errorInformation: null,
        };

        // Add the fxQuote in the database
        if (!this._passThroughMode) {
            try {
                await this._fxQuotesRepo.addFxQuote(fxQuote);
            } catch (err: unknown) {
                const errMsg = `Unable to add FX Quote to database with ID: ${conversionRequestId}`;
                this._logger.error(errMsg, err);

                const errPayload: FxQuoteUnableToAddQuoteToDatabaseErrorEvtPayload = {
                    conversionRequestId: conversionRequestId,
                    errorDescription: errMsg,
                };
                eventToPublish = new FxQuoteUnableToAddQuoteToDatabaseErrorEvt(errPayload);

                await this.publishEvent(eventToPublish, fspiopOpaqueState);
                return;
            }
        }

        // Prepare to send the fxQuote to FSPIOP via producer
        const payload: FxQuoteRequestAcceptedEvtPayload = {
            conversionRequestId: conversionRequestId,
            conversionTerms: message.payload.conversionTerms
        };
        eventToPublish = new FxQuoteRequestAcceptedEvt(payload);

        await this.publishEvent(eventToPublish, fspiopOpaqueState);
    }

    async handleFxQuoteResponseReceivedEvt(message: FxQuoteResponseReceivedEvt): Promise<void> {
        message.validatePayload();

        const conversionRequestId = message.payload.conversionRequestId;
        this._logger.info(`Started handling the event - ${message.msgName} with conversionRequestId: ${conversionRequestId}`);
        
        const fspiopOpaqueState = message.fspiopOpaqueState;
        const requesterFspId = message.payload.conversionTerms?.initiatingFsp ?? fspiopOpaqueState.requesterFspId ?? null;
        const destinationFspId = message.payload.conversionTerms?.counterPartyFsp ?? fspiopOpaqueState.destinationFspId ?? null;
        const expirationDate = message.payload.conversionTerms?.expiration ?? null;

        let eventToPublish: DomainEventMsg | null = null;
        let fxQuoteStatus: FxQuoteStatus = FxQuoteStatus.ACCEPTED;

        // Check supported currencies for both source and target
        const isSchemeValid = this.validateScheme(message);
        if (!isSchemeValid) {
            this._logger.error(`FX Quote ${conversionRequestId} rejected due to scheme validation error`);

            const errPayload: FxQuoteBCQuoteRuleSchemeViolatedResponseErrorEvtPayload = {
                conversionRequestId: conversionRequestId,
                errorDescription: `FxQuote response scheme validation failed for : ${conversionRequestId}`,
            };
            eventToPublish = new FxQuoteBCQuoteRuleSchemeViolatedResponseErrorEvt(errPayload);
            fxQuoteStatus = FxQuoteStatus.REJECTED;
        }

        if (!eventToPublish) {
            eventToPublish = await this.validateRequesterFsp(requesterFspId, conversionRequestId);

            if (eventToPublish) {
                this._logger.error(`FX Quote ${conversionRequestId} rejected due to requester FSP error`);
                fxQuoteStatus = FxQuoteStatus.REJECTED;
            }
        }

        if (!eventToPublish) {
            eventToPublish = await this.validateDestinationFsp(destinationFspId, conversionRequestId);

            if (eventToPublish) {
                this._logger.error(`FX Quote ${conversionRequestId} rejected due to destination FSP error`);
                fxQuoteStatus = FxQuoteStatus.REJECTED;
            }
        }

        if (!eventToPublish) {
            eventToPublish = this.validateFxQuoteExpirationDate(conversionRequestId, expirationDate);

            if (eventToPublish) {
                this._logger.error(`FX Quote ${conversionRequestId} has expired`);
                fxQuoteStatus = FxQuoteStatus.EXPIRED;
            }
        }

        if (!this._passThroughMode) {
            const fxQuote: Partial<IFxQuote> = {
                conversionRequestId: conversionRequestId,
                condition: message.payload.condition,
                conversionTerms: message.payload.conversionTerms,
                status: fxQuoteStatus,
            };

            try {
                await this._fxQuotesRepo.updateQuote(fxQuote as IFxQuote);
            } catch(err: unknown) {
                const errMsg = `Unable to update FX Quote in database with ID: ${conversionRequestId}`;
                this._logger.error(errMsg, err);

                const errPayload: FxQuoteUnableToUpdateQuoteToDatabaseErrorEvtPayload = {
                    conversionRequestId: conversionRequestId,
                    errorDescription: errMsg,
                };
                eventToPublish = new FxQuoteUnableToUpdateQuoteToDatabaseErrorEvt(errPayload);
            }
        }

        // If there is an error event, publish it
        if (eventToPublish) {
            await this.publishEvent(eventToPublish, fspiopOpaqueState);
            return;
        }

        // If all ok, send the accepted event
        const payload: FxQuoteResponseAcceptedEvtPayload = {
            conversionRequestId: conversionRequestId,
            condition: message.payload.condition,
            conversionTerms: message.payload.conversionTerms,
        };
        eventToPublish = new FxQuoteResponseAcceptedEvt(payload);

        await this.publishEvent(eventToPublish, fspiopOpaqueState);
    }

    async handleFxQuoteQueryReceivedEvt(message: FxQuoteQueryReceivedEvt): Promise<void> {
        message.validatePayload();

        const conversionRequestId = message.payload.conversionRequestId;
        this._logger.info(`Started handling the event - ${message.msgName} with conversionRequestId: ${conversionRequestId}`);
        
        const fspiopOpaqueState = message.fspiopOpaqueState;
        const requesterFspId = fspiopOpaqueState.requesterFspId ?? null;
        const destinationFspId = fspiopOpaqueState.destinationFspId ?? null;

        let eventToPublish: DomainEventMsg | null = null;

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

        const fxQuote = await this._fxQuotesRepo.getFxQuoteById(conversionRequestId).catch((err: unknown) => {
            this._logger.error(`Error getting FX Quote with ID: ${conversionRequestId}`, err);
            return null;
        });

        if (!fxQuote) {
            const errPayload: FxQuoteBCQuoteNotFoundErrorEvtPayload = {
                conversionRequestId: conversionRequestId,
                errorDescription: `FX Quote with ID: ${conversionRequestId} not found`,
            };
            const errEvent = new FxQuoteBCQuoteNotFoundErrorEvt(errPayload);

            await this.publishEvent(errEvent, fspiopOpaqueState);
            return;
        }

        // If all ok, send back the fx quote
        const payload: FxQuoteQueryRespondedEvtPayload = {
            conversionRequestId: fxQuote.conversionRequestId,
            condition: fxQuote.condition,
            conversionTerms: fxQuote.conversionTerms
        };
        const event = new FxQuoteQueryRespondedEvt(payload);
        
        await this.publishEvent(event, fspiopOpaqueState);
    }

    async handleFxQuoteRejectReceivedEvt(message: FxQuoteRejectReceivedEvt): Promise<void> {
        message.validatePayload();

        const conversionRequestId = message.payload.conversionRequestId;
        this._logger.info(`Started handling the event - ${message.msgName} with conversionRequestId: ${conversionRequestId}`);
        
        const fspiopOpaqueState = message.fspiopOpaqueState;
        const requesterFspId = fspiopOpaqueState.requesterFspId ?? null;
        const destinationFspId = fspiopOpaqueState.destinationFspId ?? null;

        let eventToPublish: DomainEventMsg | null = null;

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

        const payload: FxQuoteRejectRespondedEvtPayload = {
            conversionRequestId: conversionRequestId,
            errorInformation: message.payload.errorInformation,
        };
        const event = new FxQuoteRejectRespondedEvt(payload);
        
        await this.publishEvent(event, fspiopOpaqueState);
    }

    validateMessageOrGetErrorEvent(message: IMessage): DomainEventMsg | null {
		const requesterFspId = message.payload?.requesterFspId ?? null;
        const conversionRequestId = message.payload?.conversionRequestId ?? null;

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

		return errEvt;
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

    private validateScheme(message: IMessage): boolean {
        const sourceCurrency = message.payload.conversionTerms?.sourceAmount?.currency;
        const targetCurrency = message.payload.conversionTerms?.targetAmount?.currency;

        if (!sourceCurrency) {
            this._logger.error("Source currency is not included in the request");
            return false;
        }
        if (!targetCurrency) {
            this._logger.error("Target currency is not included in the request");
            return false;
        }

        const supportedCurrencies = this._schemeRules.currencies.map((currency) => currency.toLocaleLowerCase());

        if (!supportedCurrencies.includes(sourceCurrency.toLocaleLowerCase())) {
            this._logger.error("Source currency is not supported");
            return false;
        }
        if (!supportedCurrencies.includes(targetCurrency.toLocaleLowerCase())) {
            this._logger.error("Target currency is not supported");
            return false;
        }

        return true;
    }

    private validateFxQuoteExpirationDate(conversionRequestId: string, expirationDate: string): DomainEventMsg | null {
        let differenceDate = 0;

        try {
            const serverDateUtc = new Date().toISOString();
            const serverDate = new Date(serverDateUtc);
            const quoteDate = new Date(expirationDate);
            differenceDate = quoteDate.getTime() - serverDate.getTime();

        } catch(error: unknown) {
            const errMsg = `Error parsing date for ${conversionRequestId}`;
            this._logger.error(errMsg, error);

            const errPayload: FxQuoteBcQuoteExpiredErrorEvtPayload = {
                conversionRequestId: conversionRequestId,
                expirationDate: expirationDate,
                errorDescription: errMsg
            };
            return new FxQuoteBcQuoteExpiredErrorEvt(errPayload);
        }

        if (differenceDate < 0) {
            const errMsg = `FX Quote with id ${conversionRequestId} has expired at ${expirationDate}`;
            this._logger.error(errMsg);

            const errPayload: FxQuoteBcQuoteExpiredErrorEvtPayload = {
                conversionRequestId: conversionRequestId,
                expirationDate: expirationDate,
                errorDescription: errMsg
            };
            return new FxQuoteBcQuoteExpiredErrorEvt(errPayload);
        }

        return null;
    }

    async publishEvent(event: DomainEventMsg, fspiopOpaqueState: any): Promise<void> {
        event.fspiopOpaqueState = fspiopOpaqueState;
        await this._messageProducer.send(event);
        this._logger.info(`Sent message with the event - ${event.msgName}`);
    }
}