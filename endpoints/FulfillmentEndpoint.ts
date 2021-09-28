import { HttpStatusCode, IHttp, ILogger, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { ApiEndpoint, IApiEndpointInfo, IApiRequest, IApiResponse } from '@rocket.chat/apps-engine/definition/api';
import { addSecondsToDate } from '../lib/Utils';

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
                return this.processCityDetectedFromNameIntent(read, modify, request.content);
            }
            case '1.2.1 Select City from List': {
                return this.processSelectCityFromListIntent(read, modify, request.content);
            }
            case '1.2.2 Select City from List - fallback': {
                return this.processSelectCityFromListFallbackIntent(read, modify, request.content);
            }
            default: {
                return this.json({ status: HttpStatusCode.BAD_REQUEST, content: { error: 'Invalid Intent' } });
            }
        }
    }

    private async processCityDetectedFromNameIntent(read: IRead, modify: IModify, request: any): Promise<IApiResponse> {
        const { queryResult: { parameters: { city = null } = {} } = {}, session, fulfillmentMessages } = request || {};
        if (!city) {
            return this.json({ status: HttpStatusCode.BAD_REQUEST, content: { error: 'Invalid parameters. No name and city param found' } });
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

        await modify.getScheduler().scheduleOnce({ id: 'DepartmentTransferJob', when: addSecondsToDate(new Date(), 2), data: { session, departmentId: mapping.departmentId } });

        return this.success({ fulfillmentMessages });
    }

    private async processSelectCityFromListIntent(read: IRead, modify: IModify, request: any): Promise<IApiResponse> {
        const { queryResult: { parameters: { optionNumber = null } = {} } = {}, session, fulfillmentMessages } = request || {};
        if (!optionNumber) {
            return this.json({ status: HttpStatusCode.BAD_REQUEST, content: { error: 'Invalid parameters. No optionNumber param found' } });
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

        await modify.getScheduler().scheduleOnce({ id: 'DepartmentTransferJob', when: addSecondsToDate(new Date(), 2), data: { session, departmentId: mapping.departmentId } });

        return this.success({ fulfillmentMessages });
    }

    private async processSelectCityFromListFallbackIntent(read: IRead, modify: IModify, request: any): Promise<IApiResponse> {
        const { session, fulfillmentMessages } = request || {};

        const defaultDepartment: string | undefined = await read.getEnvironmentReader().getSettings().getValueById('Default-Handover-department');
        if (!defaultDepartment || !defaultDepartment.length) {
            console.error(`Error! Empty Default department setting`);
            this.app.getLogger().error(`Error! Empty Default department setting`);
            this.json({ status: HttpStatusCode.INTERNAL_SERVER_ERROR, content: { error: `Error! Empty Default department setting` } });
        }

        await modify.getScheduler().scheduleOnce({ id: 'DepartmentTransferJob', when: addSecondsToDate(new Date(), 2), data: { session, departmentId: defaultDepartment } });

        return this.success({ fulfillmentMessages });
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
