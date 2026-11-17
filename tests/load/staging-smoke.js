import http from 'k6/http';
import { check } from 'k6';

const baseUrl = __ENV.BASE_URL;
if (!baseUrl) throw new Error('BASE_URL is required');

export const options = {
  vus: 2,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  for (const path of ['/healthz', '/readyz']) {
    const response = http.get(`${baseUrl}${path}`, { tags: { endpoint: path } });
    check(response, { [`${path} returns 200`]: (result) => result.status === 200 });
  }
}
