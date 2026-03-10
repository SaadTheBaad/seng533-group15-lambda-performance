import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL;

export const options = {
  scenarios: {
    burst_load: {
      executor: "ramping-arrival-rate",
      startRate: 5,
      timeUnit: "1s",
      preAllocatedVUs: 100,
      maxVUs: 500,
      stages: [
        { target: 200, duration: "30s" },
        { target: 200, duration: "9m30s" }
      ],
    },
  },
};

export default function () {
  const payload = JSON.stringify({
    user: "group15",
    testType: "burst"
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
    },
  };

  const res = http.post(BASE_URL, payload, params);

  check(res, {
    "status is 200": (r) => r.status === 200,
  });
}