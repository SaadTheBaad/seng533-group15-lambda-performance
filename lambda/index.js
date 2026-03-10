exports.handler = async (event) => {
  const start = Date.now();

  let payload = {};
  try {
    if (event.body) {
      payload = JSON.parse(event.body);
    }
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  let sum = 0;
  for (let i = 0; i < 100000; i++) {
    sum += i;
  }

  const end = Date.now();

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Success",
      input: payload,
      computeResult: sum,
      processingTimeMs: end - start,
      timestamp: new Date().toISOString(),
    }),
  };
};