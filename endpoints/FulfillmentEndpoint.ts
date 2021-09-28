import { HttpStatusCode, IHttp, ILogger, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { ApiEndpoint, IApiEndpointInfo, IApiRequest, IApiResponse } from '@rocket.chat/apps-engine/definition/api';

export class FulfillmentEndpoint extends ApiEndpoint {
    public path = 'fulfillment';

    public async post(request: IApiRequest,
                      endpoint: IApiEndpointInfo,
                      read: IRead,
                      modify: IModify,
                      http: IHttp,
                      persis: IPersistence): Promise<IApiResponse> {

        console.error('---request', JSON.stringify(request.content));

        const { queryResult: { intent: { displayName = null } = {} } = {} } = request.content || {};

        switch (displayName) {
            case '1.1 City detected from Name': {
                return this.processCityDetectedFromNameIntent(read, http, request.content);
            }
            case '1.2.1 Select City from List': {
                return this.processSelectCityFromListIntent(read, http, request.content);
            }
            case '1.2.2 Select City from List - fallback': {
                return this.processSelectCityFromListFallbackIntent(read, http, request.content);
            }
            default: {
                return this.json({ status: HttpStatusCode.BAD_REQUEST, content: { error: 'Invalid Intent' } });
            }
        }
    }

    private async processCityDetectedFromNameIntent(read: IRead, http: IHttp, request: any): Promise<IApiResponse> {
        const { queryResult: { parameters: { city = null } = {} } = {}, session } = request.content || {};
        if (!city) {
            return this.json({ status: HttpStatusCode.BAD_REQUEST, content: { error: 'Invalid parameters. No name and city param found' } });
        }

        const serverURL = await read.getEnvironmentReader().getServerSettings().getValueById('Site_Url');
        if (!serverURL) {
            console.error('Error: Server url not found');
            this.app.getLogger().error('Server url not found');
            return this.json({ status: HttpStatusCode.INTERNAL_SERVER_ERROR, content: { error: 'Internal Error. Invalid ServerUrl setting on server' } });
        }

        const CityToDepartmentMap = await this.getMappingsFromSettings(read, this.app.getLogger());
        if (!CityToDepartmentMap) {
            console.error('Error resolving city to department id mapping data from settings');
            return this.json({ status: HttpStatusCode.INTERNAL_SERVER_ERROR, content: { error: 'Internal Error. Error resolving city to department id mapping data from settings' } });
        }

        const mapping = CityToDepartmentMap[city];
        if (!mapping || !mapping.departmentId) {
            console.error(`Error! No mapping record found for city ${ city }`);
            this.app.getLogger().error(`Error! No mapping record found for city ${ city }`);
            this.json({ status: HttpStatusCode.INTERNAL_SERVER_ERROR, content: { error: `Error! Invalid mapping record found for city ${ city }` } });
        }

        const dialogflowIncomingEndpointPath = `${ serverURL }/api/apps/public/21b7d3ba-031b-41d9-8ff2-fbbfa081ae90/incoming`;
        console.error(`Request url for handover: ${ dialogflowIncomingEndpointPath }`);
        this.app.getLogger().debug(`Request url for handover: ${ dialogflowIncomingEndpointPath }`);
        const handoverRequestPayload = {
            action: 'handover',
            sessionId: session.split('/')[session.split('/').length - 1],
            actionData: {
                targetDepartment: mapping.departmentId,
            },
        };
        this.app.getLogger().debug(`Request payload for handover: ${ JSON.stringify(handoverRequestPayload) }`);
        console.error(`Request payload for handover: ${ JSON.stringify(handoverRequestPayload) }`);

        const response = await http.post(dialogflowIncomingEndpointPath, { headers: { 'Content-Type': 'application/json' }, data: handoverRequestPayload } );
        this.app.getLogger().debug(`Response from handover endpoint: status=${ response.statusCode } content:${ response.content }`);
        console.error(`Response from handover endpoint: status=${ response.statusCode } content:${ response.content }`);

        return this.success({ fulfillmentMessages: [] });
    }

    private async processSelectCityFromListIntent(read: IRead, http: IHttp, request: any): Promise<IApiResponse> {
        const { queryResult: { parameters: { cityNumber: optionNumber = null } = {} } = {}, session } = request.content || {};
        if (!optionNumber) {
            return this.json({ status: HttpStatusCode.BAD_REQUEST, content: { error: 'Invalid parameters. No cityNumber param found' } });
        }

        const serverURL = await read.getEnvironmentReader().getServerSettings().getValueById('Site_Url');
        if (!serverURL) {
            console.error('Error: Server url not found');
            this.app.getLogger().error('Server url not found');
            return this.json({ status: HttpStatusCode.INTERNAL_SERVER_ERROR, content: { error: 'Internal Error. Invalid ServerUrl setting on server' } });
        }

        const CityToDepartmentMap: {
            [key: string]: {
                departmentId: string;
                optionNumber: number;
            },
        } = await this.getMappingsFromSettings(read, this.app.getLogger());

        if (!CityToDepartmentMap) {
            console.error('Error resolving city to department id mapping data from settings');
            return this.json({ status: HttpStatusCode.INTERNAL_SERVER_ERROR, content: { error: 'Internal Error. Error resolving city to department id mapping data from settings' } });
        }

        const mapping = this.resolveCityInfoFromOptionNumber(CityToDepartmentMap, optionNumber);
        if (!mapping || !mapping.optionNumber) {
            // TODO: Need to handle this somehow -
            // https://cloud.google.com/dialogflow/es/docs/events-custom#webhook
            // https://cloud.google.com/dialogflow/es/docs/fulfillment-webhook#event
            console.error(`Error! No mapping record found for optionNumber ${ optionNumber }`);
            this.app.getLogger().error(`Error! No mapping record found for optionNumber ${ optionNumber }`);
            return this.success({
                followupEventInput: {
                    name: '1_2_2_Select_City_from_List_fallback',
                },
            });
        }

        const dialogflowIncomingEndpointPath = `${ serverURL }/api/apps/public/21b7d3ba-031b-41d9-8ff2-fbbfa081ae90/incoming`;
        console.error(`Request url for handover: ${ dialogflowIncomingEndpointPath }`);
        this.app.getLogger().debug(`Request url for handover: ${ dialogflowIncomingEndpointPath }`);
        const handoverRequestPayload = {
            action: 'handover',
            sessionId: session.split('/')[session.split('/').length - 1],
            actionData: {
                targetDepartment: mapping.optionNumber,
            },
        };
        this.app.getLogger().debug(`Request payload for handover: ${ JSON.stringify(handoverRequestPayload) }`);
        console.error(`Request payload for handover: ${ JSON.stringify(handoverRequestPayload) }`);

        const response = await http.post(dialogflowIncomingEndpointPath, { headers: { 'Content-Type': 'application/json' }, data: handoverRequestPayload } );
        this.app.getLogger().debug(`Response from handover endpoint: status=${ response.statusCode } content:${ response.content }`);
        console.error(`Response from handover endpoint: status=${ response.statusCode } content:${ response.content }`);

        return this.success({ fulfillmentMessages: [] });
    }

    private async processSelectCityFromListFallbackIntent(read: IRead, http: IHttp, request: any): Promise<IApiResponse> {
        const { session } = request.content || {};

        const serverURL = await read.getEnvironmentReader().getServerSettings().getValueById('Site_Url');
        if (!serverURL) {
            console.error('Error: Server url not found');
            this.app.getLogger().error('Server url not found');
            return this.json({ status: HttpStatusCode.INTERNAL_SERVER_ERROR, content: { error: 'Internal Error. Invalid ServerUrl setting on server' } });
        }

        const defaultDepartment: string | undefined = await read.getEnvironmentReader().getSettings().getValueById('Default-Handover-department');
        if (!defaultDepartment || !defaultDepartment.length) {
            console.error(`Error! Empty Default department setting`);
            this.app.getLogger().error(`Error! Empty Default department setting`);
            this.json({ status: HttpStatusCode.INTERNAL_SERVER_ERROR, content: { error: `Error! Empty Default department setting` } });
        }

        const dialogflowIncomingEndpointPath = `${ serverURL }/api/apps/public/21b7d3ba-031b-41d9-8ff2-fbbfa081ae90/incoming`;
        console.error(`Request url for handover: ${ dialogflowIncomingEndpointPath }`);
        this.app.getLogger().debug(`Request url for handover: ${ dialogflowIncomingEndpointPath }`);
        const handoverRequestPayload = {
            action: 'handover',
            sessionId: session.split('/')[session.split('/').length - 1],
            actionData: {
                targetDepartment: defaultDepartment,
            },
        };
        this.app.getLogger().debug(`Request payload for handover: ${ JSON.stringify(handoverRequestPayload) }`);
        console.error(`Request payload for handover: ${ JSON.stringify(handoverRequestPayload) }`);

        const response = await http.post(dialogflowIncomingEndpointPath, { headers: { 'Content-Type': 'application/json' }, data: handoverRequestPayload } );
        this.app.getLogger().debug(`Response from handover endpoint: status=${ response.statusCode } content:${ response.content }`);
        console.error(`Response from handover endpoint: status=${ response.statusCode } content:${ response.content }`);

        return this.success({ fulfillmentMessages: [] });
    }

    // tslint:disable-next-line: max-line-length
    private resolveCityInfoFromOptionNumber(CityToDepartmentMap: { [key: string]: { departmentId: string; optionNumber: number; }}, optionNumber: number): { departmentId: string; optionNumber: number } | undefined {
        for (const [key, value] of Object.entries(CityToDepartmentMap)) {
            if (value.optionNumber === optionNumber) {
                return CityToDepartmentMap[key];
            }
        }
        return;
    }

    private async getMappingsFromSettings(read: IRead, logger: ILogger) {
        const rulesString: string = await read.getEnvironmentReader().getSettings().getValueById('City-to-department-id-mapping');
        if (!rulesString || rulesString.trim().length === 0) {
            return;
        }

        const withoutComments: string = rulesString.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? '' : m);
        const withoutTrailingComma: string = withoutComments.replace(/\,(?!\s*?[\{\[\"\'\w])/g, (m, g) => g ? '' : m);
        const escapeBackslash = withoutTrailingComma.replace(/\\/g, '\\\\');
        try {
            const mappings = JSON.parse(escapeBackslash);
            if (!mappings) {
                return;
            }
            return mappings;

        } catch (err) {
            console.error('Error occurred while parsing the mapping data. Details:', err.message);
            logger.error('Error occurred while parsing the mapping data. Details:', err.message);
        }
    }
}
