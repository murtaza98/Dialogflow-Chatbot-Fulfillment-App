import { HttpStatusCode, IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { ApiEndpoint, IApiEndpointInfo, IApiRequest, IApiResponse } from '@rocket.chat/apps-engine/definition/api';
import { CityToDepartmentMap } from '../CityToDepartmentMapping';

export class FulfillmentEndpoint extends ApiEndpoint {
    public path = 'fulfillment';

    public async post(request: IApiRequest,
                      endpoint: IApiEndpointInfo,
                      read: IRead,
                      modify: IModify,
                      http: IHttp,
                      persis: IPersistence): Promise<IApiResponse> {

        console.log('---request', JSON.stringify(request.content));

        const { queryResult: { parameters: { name = null, city = null } = {}, intent: { displayName = null } = {} } = {}, session } = request.content || {};
        if (displayName !== 'Main Intent') {
            console.log('Non Main Intent success');
            return this.success({ fulfillmentMessages: [] });
        }
        if (!name || !city) {
            return this.json({ status: HttpStatusCode.BAD_REQUEST, content: { error: 'Invalid parameters. No name and city param found' } });
        }

        const serverURL = await read.getEnvironmentReader().getServerSettings().getValueById('Site_Url');
        if (!serverURL) {
            console.log('Error: Server url not found');
            this.app.getLogger().error('Server url not found');
        }

        const handoverDepartment = CityToDepartmentMap[city];
        if (!handoverDepartment) {
            console.log(`Error! No mapping record found for city ${ city }`);
            this.app.getLogger().error(`Error! No mapping record found for city ${ city }`);
            this.json({ status: HttpStatusCode.INTERNAL_SERVER_ERROR, content: { error: `Error! No mapping record found for city ${ city }` } });
        }

        const dialogflowIncomingEndpointPath = `${ serverURL }/api/apps/public/21b7d3ba-031b-41d9-8ff2-fbbfa081ae90/incoming`;
        console.log(`Request url for handover: ${ dialogflowIncomingEndpointPath }`);
        this.app.getLogger().debug(`Request url for handover: ${ dialogflowIncomingEndpointPath }`);
        const handoverRequestPayload = {
            action: 'handover',
            sessionId: session.split('/')[session.split('/').length - 1],
            actionData: {
                targetDepartment: CityToDepartmentMap[city],
            },
        };
        this.app.getLogger().debug(`Request payload for handover: ${ JSON.stringify(handoverRequestPayload) }`);
        console.log(`Request payload for handover: ${ JSON.stringify(handoverRequestPayload) }`);

        const response = await http.post(dialogflowIncomingEndpointPath, { headers: { 'Content-Type': 'application/json' }, data: handoverRequestPayload } );
        this.app.getLogger().debug(`Response from handover endpoint: status=${ response.statusCode } content:${ response.content }`);
        console.log(`Response from handover endpoint: status=${ response.statusCode } content:${ response.content }`);

        return this.success({ fulfillmentMessages: [] });
    }
}
