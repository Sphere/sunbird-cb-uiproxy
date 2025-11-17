import { CONSTANTS } from '../utils/env';
import { logInfo } from '../utils/logger';
const cassandra = require('cassandra-driver');

// Create cassandra client
const cassandraClient = new cassandra.Client({
  contactPoints: [CONSTANTS.CASSANDRA_IP],
  keyspace: 'sunbird',
  localDataCenter: 'datacenter1',
});
export interface RatingSummary {
  activityId: string;
  activityType: string;
  averageRating: number;
  sumOfTotalRatings: number;
  totalNumberOfRatings: number;
}

export const getRatingSummaries = async (
  activityType: string,
  activityIds: string[]
): Promise<RatingSummary[]> => {
  if (!activityIds || activityIds.length === 0) {
    return [];
  }

  const placeholders = activityIds.map(() => '?').join(',');
  // tslint:disable-next-line: max-line-length
  const query = `
    SELECT activityid, activitytype, total_number_of_ratings, sum_of_total_ratings
    FROM ratings_summary
    WHERE activitytype = ? AND activityid IN (${placeholders})
  `;
  const params = [activityType, ...activityIds];

  const result = await cassandraClient.execute(query, params, {
    prepare: true,
  });
  // tslint:disable-next-line: no-any
  const ratingsData = result.rows.map((row: any) => ({
    activityId: row.activityid,
    activityType: row.activitytype,
    averageRating:
      row.total_number_of_ratings > 0
        ? Math.round(
            (row.sum_of_total_ratings / row.total_number_of_ratings) * 100
          ) / 100
        : 0,
    sumOfTotalRatings: row.sum_of_total_ratings || 0,
    totalNumberOfRatings: row.total_number_of_ratings || 0,
  }));

  logInfo('Ratings data from Cassandra: ' + JSON.stringify(ratingsData));
  return ratingsData;
};

export async function getContentWithRatings(searchResult, ratingFlag) {
  if (!ratingFlag) return searchResult;

  const contents = searchResult?.content || [];
  if (!contents.length) return searchResult;

  const activityIds = contents.map((c) => c.identifier);
  const ratings: RatingSummary[] = await getRatingSummaries(
    'Course',
    activityIds
  );

  const ratingMap = new Map(ratings.map((r) => [r.activityId, r]));
  const enrichedContent = contents.map((item) => ({
    ...item,
    averageRating: ratingMap.get(item.identifier)?.averageRating ?? 0,
    sumOfTotalRatings: ratingMap.get(item.identifier)?.sumOfTotalRatings ?? 0,
    totalNumberOfRatings:
      ratingMap.get(item.identifier)?.totalNumberOfRatings ?? 0,
  }));

  return {
    ...searchResult,
    content: enrichedContent,
  };
}
