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

import express from "express";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {IConfigurationClient} from "@mojaloop/platform-configuration-bc-public-types-lib";


export class ExpressRoutes {
    private _logger:ILogger;
    private _configClient: IConfigurationClient;

    private _mainRouter = express.Router();


    constructor(configClient: IConfigurationClient, logger:ILogger) {
        this._configClient = configClient;
        this._logger = logger;

        // endpoints
        this._mainRouter.get("/", this.getExample.bind(this));
        this._mainRouter.get("/version", this.getVersion.bind(this));
    }

    get MainRouter():express.Router{
        return this._mainRouter;
    }

    private async getExample(req: express.Request, res: express.Response, next: express.NextFunction){
        this._logger.debug("Got request to example endpoint");
        return res.send({resp:"example worked"});
    }

    private async getVersion(req: express.Request, res: express.Response, next: express.NextFunction){
        this._logger.debug("Got request to version endpoint");
        return res.send({
            environmentName: this._configClient.environmentName,
            bcName: this._configClient.boundedContextName,
            appName: this._configClient.applicationName,
            appVersion: this._configClient.applicationVersion,
            configsIterationNumber: this._configClient.appConfigs.iterationNumber
        });
    }


}
