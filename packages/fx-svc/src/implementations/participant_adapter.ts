/**
 License
 --------------
 Copyright © 2021 Mojaloop Foundation

 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License.

 You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '' in the first column. People who have
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
 **/

"use strict";

import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import { ParticipantsHttpClient } from "@mojaloop/participants-bc-client-lib";
import { ParticipantSearchResults } from "../domain/types";
import { IParticipantsServiceAdapter } from "../domain/interfaces";
import { IAuthenticatedHttpRequester } from "@mojaloop/security-bc-public-types-lib";

export class ParticipantAdapter implements IParticipantsServiceAdapter {
    private readonly _logger: ILogger;
    // private readonly _localCache: ILocalCache;
    private readonly _clientBaseUrl: string;
    private readonly _externalParticipantClient :ParticipantsHttpClient;
    private readonly _authRequester :IAuthenticatedHttpRequester;
    private readonly _timeoutMs :number;
    // private validateStatus = (status: number): boolean => status === 200;

    constructor(
        logger: ILogger,
        clientBaseUrl: string,
        authRequester: IAuthenticatedHttpRequester,
        timeoutMs: number,
    ) {
        this._logger = logger.createChild(this.constructor.name);
        this._clientBaseUrl = clientBaseUrl;
        this._authRequester = authRequester;
        this._timeoutMs = timeoutMs;
        this._externalParticipantClient = new ParticipantsHttpClient(this._logger, this._clientBaseUrl, this._authRequester, this._timeoutMs);
    }

    async getAllParticipants(): Promise<ParticipantSearchResults | null> {
        try {
            const result = await this._externalParticipantClient.getAllParticipants();
            return result as unknown as ParticipantSearchResults;

        } catch (err: unknown) {
            this._logger.error("getAllParticipants -> error: ", err);
            return null;
        }
    }
}
 