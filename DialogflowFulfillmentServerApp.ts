import {
    IAppAccessors,
    IConfigurationExtend,
    ILogger,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ApiSecurity, ApiVisibility } from '@rocket.chat/apps-engine/definition/api';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { SettingType } from '@rocket.chat/apps-engine/definition/settings';
import { FulfillmentEndpoint } from './endpoints/FulfillmentEndpoint';
import { DepartmentTransferJob } from './jobs/DepartmentTransferJob';

const initialSettingValue = `{
    "Gaspar": "tSTWZZELDmdGJovPm",
}`;

export class DialogflowFulfillmentServerApp extends App {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    protected async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
        configuration.api.provideApi({
            visibility: ApiVisibility.PRIVATE,
            security: ApiSecurity.UNSECURE,
            endpoints: [
                new FulfillmentEndpoint(this),
            ],
        });

        configuration.settings.provideSetting({
            id: 'Default-Handover-department',
            public: true,
            type: SettingType.STRING,
            packageValue: '',
            value: '',
            i18nLabel: 'Default Handover Department',
            required: true,
        });

        configuration.settings.provideSetting({
            id: 'City-to-department-id-mapping',
            public: true,
            type: SettingType.CODE,
            packageValue: initialSettingValue,
            value: initialSettingValue,
            i18nLabel: 'City to Department ID mapping',
            required: true,
        });

        await configuration.scheduler.registerProcessors([
            new DepartmentTransferJob(this).getDepartmentTransferJob(),
        ]);
    }
}
