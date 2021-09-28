import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IJobContext, IProcessor } from '@rocket.chat/apps-engine/definition/scheduler';
import { DialogflowFulfillmentServerApp } from '../DialogflowFulfillmentServerApp';

export class DepartmentTransferJob {
    constructor(private app: DialogflowFulfillmentServerApp) {}

    public getDepartmentTransferJob(): IProcessor {
        const job: IProcessor = {
            id: 'DepartmentTransferJob',
            // tslint:disable-next-line: indent
            processor: this.processor.bind(this),
        };
        return job;
    }

    private async processor(jobContext: IJobContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence) {
        const { departmentId, session } = jobContext;
        if (!departmentId || !session) {
            console.error('Error: Invalid params for job');
            this.app.getLogger().error('Error: Invalid params for job');
            return;
        }

        const serverURL = await read.getEnvironmentReader().getServerSettings().getValueById('Site_Url');
        if (!serverURL) {
            console.error('Error: Server url not found');
            this.app.getLogger().error('Server url not found');
            return;
        }

        const dialogflowIncomingEndpointPath = `${ serverURL }/api/apps/public/21b7d3ba-031b-41d9-8ff2-fbbfa081ae90/incoming`;
        console.error(`Request url for handover: ${ dialogflowIncomingEndpointPath }`);
        this.app.getLogger().debug(`Request url for handover: ${ dialogflowIncomingEndpointPath }`);
        const handoverRequestPayload = {
            action: 'handover',
            sessionId: session.split('/')[session.split('/').length - 1],
            actionData: {
                targetDepartment: departmentId,
            },
        };
        this.app.getLogger().debug(`Request payload for handover: ${ JSON.stringify(handoverRequestPayload) }`);
        console.error(`Request payload for handover: ${ JSON.stringify(handoverRequestPayload) }`);

        const response = await http.post(dialogflowIncomingEndpointPath, { headers: { 'Content-Type': 'application/json' }, data: handoverRequestPayload } );
        this.app.getLogger().debug(`Response from handover endpoint: status=${ response.statusCode } content:${ response.content }`);
        console.error(`Response from handover endpoint: status=${ response.statusCode } content:${ response.content }`);
    }
}
