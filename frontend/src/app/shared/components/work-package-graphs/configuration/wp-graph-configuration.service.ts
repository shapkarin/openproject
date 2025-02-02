import { I18nService } from 'core-app/core/i18n/i18n.service';
import { WpGraphConfigurationSettingsTab } from "core-app/shared/components/work-package-graphs/configuration-modal/tabs/settings-tab.component";
import { QueryResource } from "core-app/features/hal/resources/query-resource";
import { TabInterface } from "core-app/features/work-packages/components/wp-table/configuration-modal/tab-portal-outlet";
import { Injectable } from '@angular/core';
import { WpGraphConfigurationFiltersTab } from "core-app/shared/components/work-package-graphs/configuration-modal/tabs/filters-tab.component";
import { ChartOptions, ChartType } from 'chart.js';
import { QueryFormResource } from "core-app/features/hal/resources/query-form-resource";
import {
  WpGraphConfiguration,
  WpGraphQueryParams
} from "core-app/shared/components/work-package-graphs/configuration/wp-graph-configuration";
import { CurrentProjectService } from "core-app/core/current-project/current-project.service";
import { WorkPackageNotificationService } from "core-app/features/work-packages/services/notifications/work-package-notification.service";
import { APIV3Service } from "core-app/core/apiv3/api-v3.service";
import { WorkPackageEmbeddedGraphDataset } from "core-app/shared/components/work-package-graphs/embedded/wp-embedded-graph.component";

@Injectable()
export class WpGraphConfigurationService {

  private _configuration:WpGraphConfiguration;
  private _forms:{[id:string]:QueryFormResource} = {};
  private _formsPromise:Promise<void[]>|null;

  constructor(readonly I18n:I18nService,
              readonly apiv3Service:APIV3Service,
              readonly notificationService:WorkPackageNotificationService,
              readonly currentProject:CurrentProjectService) {
  }

  public persistAndReload():Promise<unknown> {
    return this
      .persistChanges()
      .then(() => this.reloadQueries());
  }

  public persistChanges():Promise<unknown> {
    const promises = this.queries.map(query => {
      return this.saveQuery(query);
    });

    return Promise.all(promises);
  }

  public get datasets():WorkPackageEmbeddedGraphDataset[] {
    return this.queries.map(query => {
      return {
        groups: query.results.groups,
        queryProps: '',
        label: query.name
      };
    });
  }

  public reloadQueries():Promise<unknown> {
    this.configuration.queries.length = 0;

    return this.loadQueries();
  }

  public ensureQueryAndLoad():Promise<unknown> {
    if (this.queryParams.length === 0) {
      return this.createInitial()
        .then((query) => {
          this.queryParams.push({ id: query.id! });

          return this.loadQueries();
        });
    } else {
      return this.loadQueries();
    }
  }

  private createInitial():Promise<QueryResource> {
    return this
      .apiv3Service
      .queries
      .form
      .loadWithParams(
        { pageSize: 0 },
        undefined,
        this.currentProject.identifier,
        WpGraphConfiguration.queryCreationParams(this.I18n, !!this.currentProject.identifier)
      )
      .toPromise()
      .then(([form, query]) => {
        return this
          .apiv3Service
          .queries
          .post(query, form)
          .toPromise();
      });
  }

  private loadQueries() {
    const queryPromises = this.queryParams.map(queryParam => {
      return this.loadQuery(queryParam);
    });

    return Promise.all(queryPromises);
  }

  private loadQuery(params:WpGraphQueryParams) {
    return this
      .apiv3Service
      .queries
      .find(
        Object.assign({ pageSize: 0 }, params.props),
        params.id,
        this.currentProject.identifier,
      )
      .toPromise()
      .then(query => {
        if (params.name) {
          query.name = params.name;
        }
        this.configuration.queries.push(query);
      });
  }

  private async saveQuery(query:QueryResource) {
    return this.formFor(query)
      .then(form => {
        return this
          .apiv3Service
          .queries
          .id(query)
          .patch(query, form)
          .toPromise();
      });
  }

  public get configuration() {
    return this._configuration;
  }

  public set configuration(config:WpGraphConfiguration) {
    this._configuration = config;
    this._formsPromise = null;
  }

  public async formFor(query:QueryResource):Promise<QueryFormResource> {
    return this
      .loadForms()
      .then(() => {
        return this._forms[query.id!];
      });
  }

  public get tabs():TabInterface[] {
    const tabs:TabInterface[] = [
      {
        id: 'graph-settings',
        name: this.I18n.t('js.chart.tabs.graph_settings'),
        componentClass: WpGraphConfigurationSettingsTab,
      }
    ];

    const queryTabs = this.configuration.queries.map((query) => {
      return {
        id: query.id as string,
        name: this.I18n.t('js.work_packages.query.filters'),
        componentClass: WpGraphConfigurationFiltersTab
      };
    });

    return tabs.concat(queryTabs);
  }

  public loadForms():Promise<unknown> {
    if (!this._formsPromise) {
      const formPromises = this.configuration.queries.map((query) => {
        return this
          .apiv3Service
          .queries
          .form
          .load(query)
          .toPromise()
          .then(([form, _]) => {
            this._forms[query.id as string] = form;
          })
          .catch((error) => this.notificationService.handleRawError(error));
      });

      this._formsPromise = Promise.all(formPromises);
    }

    return this._formsPromise;
  }

  public get chartType():ChartType {
    return this._configuration.chartType;
  }

  public set chartType(type:ChartType) {
    this._configuration.chartType = type;
  }

  public get queries():QueryResource[] {
    return this._configuration.queries;
  }

  public get chartOptions():ChartOptions {
    return this._configuration.chartOptions;
  }

  public get queryParams():WpGraphQueryParams[] {
    return this._configuration.queryParams;
  }
}
