import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL;

export const options = {
  scenarios: {
    sustained_load: {
      executor: "constant-arrival-rate",
      rate: Number(__ENV.RATE || 5),
      timeUnit: "1s",
      duration: "10m",
      preAllocatedVUs: Number(__ENV.PREALLOCATED_VUS || 50),
      maxVUs: Number(__ENV.MAX_VUS || 300),
    },
  },
};

export default function () {
  const payload = JSON.stringify({
    user: "group15",
    testType: "sustained"
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