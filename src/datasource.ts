import defaults from 'lodash/defaults';

import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  MutableDataFrame,
  FieldType,
} from '@grafana/data';

import { getBackendSrv, toDataQueryResponse } from "@grafana/runtime"

import { MyQuery, MyDataSourceOptions, defaultQuery } from './types';
import retryOrThrow from 'util/retry';

export class DataSource extends DataSourceApi<MyQuery, MyDataSourceOptions> {
  resolution: number;
  defaultRegion:string;
  
  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
    this.defaultRegion = instanceSettings.jsonData.defaultRegion;
    this.resolution = instanceSettings.jsonData.resolution || 1000.0;
  }

  async query(options: DataQueryRequest<MyQuery>): Promise<DataQueryResponse> {
    const { range } = options;
    const from = range!.from.valueOf();
    const to = range!.to.valueOf();

    // Return a constant for each query.
    const data = options.targets.map(target => {
      const query = defaults(target, defaultQuery);
      const frame = new MutableDataFrame({
        refId: query.refId,
        fields: [
          { name: 'time', type: FieldType.time },
          { name: 'value', type: FieldType.number },
        ],
      });
      const duration = to - from;
      const step = duration / this.resolution;
      for (let t = 0; t < duration; t += step) {
        frame.add({ time: from + t, value: Math.sin((2 * Math.PI * query.frequency * t) / duration) });
      }
      return frame;
    });

    return { data };
  }

  async testDatasource() {
    // Implement a health check for your data source.
    return this.doRequest({
      targets: [
        {
          queryType: "test",
          region: this.defaultRegion,
          tenancyOCID: this.tenancyOCID,
          compartment: "",
          environment: this.environment,
          datasourceId: this.id,
        },
      ],
      range: this.timeSrv.timeRange(),
    })
      .then((response) => {
        if (response.status === 200) {
          return {
            status: "success",
            message: "Data source is working",
            title: "Success",
          };
        }
      })
      .catch(() => {
        return {
          status: "error",
          message: "Data source is not working",
          title: "Failure",
        };
      });
  }
  
  async doRequest (options:any) {
    return retryOrThrow(async () => {
      return await getBackendSrv().datasourceRequest({
        url: "/api/ds/query",
        method: "POST",
        data: {
          from: options.range.from.valueOf().toString(),
          to: options.range.to.valueOf().toString(),
          queries: options.targets,
        },
      });
    }, 10).then((res:any) => toDataQueryResponse(res, options));
  }
  // async doRequest(query: MyQuery) {
  //   const result = await getBackendSrv().datasourceRequest({
  //     method: "GET",
  //     url: "https://api.example.com/metrics",
  //     params: query,
  //   })

  //   return result;
  // }
}
