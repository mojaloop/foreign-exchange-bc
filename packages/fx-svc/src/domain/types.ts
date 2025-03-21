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
*****/

"use strict";

import { IParticipant } from "@mojaloop/participant-bc-public-types-lib";

export enum FxQuoteStatus {
    RECEIVED = "RECEIVED",
    PENDING = "PENDING",
    REJECTED = "REJECTED",
    ACCEPTED = "ACCEPTED",
    EXPIRED = "EXPIRED"
}

export declare type ParticipantSearchResults = {
	pageSize: number;
	totalPages: number;
	pageIndex: number;
	items: IParticipant[];
}

export interface IFxQuoteSchemeRules {
    currencies: string[];
}

// FX Quote
export type IAmountType = "SEND" | "RECEIVE";

export interface IMoney {
	currency: string;
	amount: string | null;
}

export interface IFxChargeMoney {
	currency: string;
	amount: string;
}

export interface IFxCharge {
	chargeType: string;
	sourceAmount: IFxChargeMoney | null;
	targetAmount: IFxChargeMoney | null;
}

export interface IExtensionList {
    extension: { key: string; value: string;}[];
}

export interface IErrorInformation {
    errorCode: string;
    errorDescription: string;
    extensionList: IExtensionList
}

export interface IConversionTerms {
	conversionId: string;
	determiningTransferId: string | null;
	initiatingFsp: string;
	counterPartyFsp: string;
	amountType: IAmountType;
	sourceAmount: IMoney;
	targetAmount: IMoney;
	expiration: string;
	charges: IFxCharge[] | null;
	extensionList: IExtensionList | null;
}

export interface IFxQuote {
	createdAt: number;
	updatedAt: number;
	conversionRequestId: string;
	conversionTerms: IConversionTerms;
	condition: string | null;
	status: FxQuoteStatus | null;
	errorInformation: IErrorInformation | null;
}