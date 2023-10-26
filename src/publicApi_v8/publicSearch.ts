import axios from "axios";
import { Router } from "express";
import _ from "lodash";
import { Pool } from "pg";
import { CONSTANTS } from "../utils/env";
import { logError } from "../utils/logger";

export const publicSearch = Router();

const API_END_POINTS = {
  search: `${CONSTANTS.HTTPS_HOST}/apis/public/v8/publicContent/v1/search`,
};
const elasticSearchConnectionDetails = {
  database: CONSTANTS.POSTGRES_DATABASE,
  host: CONSTANTS.POSTGRES_HOST,
  password: CONSTANTS.POSTGRES_PASSWORD,
  port: CONSTANTS.POSTGRES_PORT,
  user: CONSTANTS.POSTGRES_USER,
};

const pool = new Pool({
  database: elasticSearchConnectionDetails.database,
  host: elasticSearchConnectionDetails.host,
  password: elasticSearchConnectionDetails.password,
  port: Number(elasticSearchConnectionDetails.port),
  user: elasticSearchConnectionDetails.user,
});
const headers = {
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json",
  org: "aastar",
  rootorg: "aastar",
};
const nullResponseStatus = {
  responseCode: "OK",
  result: {
    content: [],
    count: 0,
    facets: [],
  },
  status: 200,
};

publicSearch.post("/getCourses", async (request, response) => {
  try {
    const facetsDataDefault = ["duration", "lastUpdatedOn"];
    const courseSearchRequestData = request.body;
    const filters = courseSearchRequestData.request.filters;
    const facets = courseSearchRequestData.request.facets;
    const sortMethod = courseSearchRequestData.request.sort_by || {
      lastUpdatedOn: "desc",
    };
    if (!courseSearchRequestData.request.query) {
      const requestBodyForSearch = JSON.stringify({
        request: {
          facets: facets || facetsDataDefault,
          filters,
          limit: 200,
          sort_by: sortMethod,
        },
        sort: [
          {
            lastUpdatedOn: "desc",
          },
        ],
      });
      const searchResponseES = await axios({
        data: requestBodyForSearch,
        headers,
        method: "post",
        url: API_END_POINTS.search,
      });
      if (searchResponseES.data.result.count == 0) {
        return response.status(200).json(nullResponseStatus);
      }
      let searchFilteredData = [];
      if (!courseSearchRequestData.request.filters.competency) {
        // tslint:disable-next-line: no-any
        searchResponseES.data.result.content.forEach((element: any) => {
          if (!element.competency) {
            searchFilteredData.push(element);
          }
        });
      } else {
        searchFilteredData = searchResponseES.data.result.content;
      }
      return response.status(200).json({
        responseCode: "OK",
        result: {
          content: searchFilteredData,
          count: searchFilteredData.length,
          facets: searchResponseES.data.result.facets,
        },
        status: 200,
      });
    }
    // .................................For search button with query on home page..............................
    if (courseSearchRequestData.request.query) {
      const courseSearchPrimaryData = {
        request: {
          facets,
          fields: [],
          filters,
          limit: 200,
          query: `${courseSearchRequestData.request.query}`,
          sort_by: sortMethod,
        },
        sort: [
          {
            lastUpdatedOn: "asc",
          },
        ],
      };
      const esResponsePrimaryCourses = await axios({
        data: courseSearchPrimaryData,
        headers,
        method: "post",
        url: API_END_POINTS.search,
      });
      let courseDataPrimary = esResponsePrimaryCourses.data.result.content;
      const facetsData = esResponsePrimaryCourses.data.result.facets;
      try {
        let finalConcatenatedData = [];
        // tslint:disable-next-line: no-any

        const result = await pool.query(
          `SELECT id FROM public.data_node where type=$1 and name ILIKE $2`,
          ["Competency", "%" + courseSearchRequestData.request.query + "%"]
        );
        // tslint:disable-next-line: no-any

        // tslint:disable-next-line: no-any
        const postgresResponseData = result.rows.map((val: any) => val.id);
        let courseDataSecondary = [];
        if (postgresResponseData.length > 0) {
          const elasticSearchData = [];
          for (const postgresResponse of postgresResponseData) {
            for (const value of [1, 2, 3, 4, 5]) {
              elasticSearchData.push(`${postgresResponse}-${value}`);
            }
          }
          const courseSearchSecondaryData = {
            request: {
              filters,
              sort_by: sortMethod,
            },
            sort: [{ lastUpdatedOn: "desc" }],
          };
          courseSearchSecondaryData.request.filters.competencySearch =
            elasticSearchData;
          const elasticSearchResponseSecond = await axios({
            data: courseSearchSecondaryData,
            headers,
            method: "post",
            url: API_END_POINTS.search,
          });
          courseDataSecondary =
            elasticSearchResponseSecond.data.result.content || [];
        }

        if (!courseDataPrimary) courseDataPrimary = [];
        const finalFilteredData = [];
        finalConcatenatedData = courseDataPrimary.concat(courseDataSecondary);
        if (finalConcatenatedData.length == 0) {
          response.status(200).json(nullResponseStatus);
          return;
        }
        finalConcatenatedData.forEach((element) => {
          if (!element.competency) {
            finalFilteredData.push(element);
          }
        });
        const uniqueCourseData = _.uniqBy(finalFilteredData, "identifier");

        response.status(200).json({
          responseCode: "OK",
          result: {
            content: uniqueCourseData,
            count: uniqueCourseData.length,
            facets: facetsData,
          },
          status: 200,
        });
      } catch (error) {
        response.status(400).json({
          message: "Error while connecting postgres",
        });
      }
    }
  } catch (err) {
    response.status(400).json({
      message: "Error while public search",
    });
  }
});
