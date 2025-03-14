/*****
License
--------------
Copyright © 2020-2025 Mojaloop Foundation
The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

Contributors
--------------
This is the official list of the Mojaloop project contributors for this file.
Names of the original copyright holders (individuals or organizations)
should be listed with a '*' in the first column. People who have
contributed from an organization can be listed under the organization
that actually holds the copyright for their contributions (see the
Mojaloop Foundation for an example). Those individuals should have
their names indented and be marked with a '-'. Email address can be added
optionally within square brackets <email>.

* Mojaloop Foundation
- Name Surname <name.surname@mojaloop.io>

* Crosslake
- Pedro Sousa Barreto <pedrob@crosslaketech.com>

* Arg Software
- José Antunes <jose.antunes@arg.software>
- Rui Rocha <rui.rocha@arg.software>
*****/

"use strict";

import { Collection, Document, MongoClient, WithId } from "mongodb";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import { IFxQuoteRepo } from "../domain/interfaces";
import {
    UnableToInitFxQuoteRegistryError,
    UnableToCloseDatabaseConnectionError,
    UnableToGetFxQuoteError,
    FxQuoteAlreadyExistsError,
    UnableToAddFxQuoteError,
    UnableToUpdateFxQuoteError,
    FxQuoteNotFoundError,
} from "./errors";
import { IFxQuote } from "../domain/types";


export class MongoFxQuotesRepo implements IFxQuoteRepo {
    private readonly _logger: ILogger;
    private readonly _connectionString: string;
    private readonly _dbName: string;
    private readonly _collectionName: string = "fx_quotes";
    private mongoClient: MongoClient;
    private fxQuotes: Collection;

    constructor(
        logger: ILogger,
        connectionString: string,
        dbName: string,
    ) {
        this._logger = logger;
        this._connectionString = connectionString;
        this._dbName = dbName;
    }

    async init(): Promise<void> {
        try {
            this.mongoClient = new MongoClient(this._connectionString);
            await this.mongoClient.connect();
            this.fxQuotes = this.mongoClient.db(this._dbName).collection(this._collectionName);

            await this.fxQuotes.createIndex({ conversionRequestId: 1 }, { unique: true });

        } catch (e: unknown) {
            this._logger.error(`Unable to connect to the database: ${(e as Error).message}`);
            throw new UnableToInitFxQuoteRegistryError("Unable to connect to the FX Quote DB");
        }
    }

    async destroy(): Promise<void> {
        try {
            await this.mongoClient.close();
        } catch(e: unknown) {
            this._logger.error(`Unable to close the database connection: ${(e as Error).message}`);
            throw new UnableToCloseDatabaseConnectionError("Unable to close the FX Quote DB connection");
        }
    }

    async getFxQuoteById(conversionRequestId: string): Promise<IFxQuote | null> {
        const fxQuote = await this.fxQuotes.findOne({
            conversionRequestId: conversionRequestId
        })
        .catch((err: unknown) => {
            this._logger.error(`Unable to get FX Quote Error: ${(err as Error).message}`);
            throw new UnableToGetFxQuoteError();
        });

        if (fxQuote) {
            return this.mapToFxQuote(fxQuote);
        }

        return fxQuote;
    }

    async addFxQuote(fxQuote: IFxQuote): Promise<string> {
        if (fxQuote.conversionRequestId) {
            await this.checkFxQuoteExistence(fxQuote.conversionRequestId);
        }

        await this.fxQuotes.insertOne(fxQuote).catch((err: unknown) => {
            this._logger.error(`Unable to add new FX Quote: ${(err as Error).message}`);
            throw new UnableToAddFxQuoteError();
        });

        return fxQuote.conversionRequestId;
    }

    async updateQuote(fxQuote: IFxQuote): Promise<void> {
        const existingFxQuote = await this.getFxQuoteById(fxQuote.conversionRequestId);
        if (!existingFxQuote || !existingFxQuote.conversionRequestId) {
            throw new FxQuoteNotFoundError();
        }

        await this.fxQuotes.updateOne({
            conversionRequestId: fxQuote.conversionRequestId
        }, {
            $set: fxQuote
        })
        .catch((err: unknown) => {
            this._logger.error(`Unable to update the FX Quote: ${(err as Error).message}`);
            throw new UnableToUpdateFxQuoteError();
        });
    }

    private async checkFxQuoteExistence(conversionRequestId: string): Promise<void> {
        const existingFxQuote: WithId<Document> | null = await this.fxQuotes.findOne({
            conversionRequestId: conversionRequestId
        })
        .catch((err: unknown) => {
            this._logger.error(`Unable to get FX Quote Error: ${(err as Error).message}`);
            throw new UnableToGetFxQuoteError();
        });

        if (existingFxQuote) {
            throw new FxQuoteAlreadyExistsError();
        }
    }

    private mapToFxQuote(fxQuote: WithId<Document>): IFxQuote {
        const mappedFxQuote: IFxQuote = {
            createdAt: fxQuote.createdAt ?? null,
            updatedAt: fxQuote.updatedAt ?? null,
            conversionRequestId: fxQuote.conversionRequestId ?? null,
            conversionTerms: fxQuote.conversionTerms ?? null,
            condition: fxQuote.condition ?? null,
            status: fxQuote.status ?? null,
            errorInformation: fxQuote.errorInformation ?? null,
        };

        return mappedFxQuote;
    }
}