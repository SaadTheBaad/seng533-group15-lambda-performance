const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const CSV_PATH = path.join(REPO_ROOT, "results", "master_results.csv");
const FIGURES_DIR = path.join(
  REPO_ROOT,
  "results",
  "plots",
  "final_report_paper_figures"
);
const REPORT_ASSETS_DIR = path.join(REPO_ROOT, "results", "report_assets");
const T_CRIT_95_DF2 = 4.302652729911275;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell);
      cell = "";
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    cell += char;
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value !== "")) {
      rows.push(row);
    }
  }

  const [header, ...body] = rows;
  return body.map((values) => {
    const record = {};
    header.forEach((key, index) => {
      record[key] = values[index] ?? "";
    });
    return record;
  });
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleSd(values) {
  if (values.length < 2) {
    return 0;
  }
  const avg = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function ci95(values) {
  if (values.length < 2) {
    return 0;
  }
  return (T_CRIT_95_DF2 * sampleSd(values)) / Math.sqrt(values.length);
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function groupBy(records, keyFn) {
  const map = new Map();
  records.forEach((record) => {
    const key = keyFn(record);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(record);
  });
  return map;
}

function loadRows() {
  const csv = fs.readFileSync(CSV_PATH, "utf8");
  return parseCsv(csv)
    .filter((row) => row.run_id && row.run_id.trim() !== "")
    .map((row) => {
      const workload =
        row.workload_type.trim().toLowerCase() === "sustaiined"
          ? "sustained"
          : row.workload_type.trim().toLowerCase();
      const reserved = (row.reserved_concurrency || "").trim().toLowerCase();
      const durationMinutes = toNumber(row.duration_minutes);
      const requestsCompleted = toNumber(row.requests_completed);
      return {
        run_id: row.run_id.trim().toLowerCase(),
        repetition: toNumber(row.repetition),
        workload_type: workload,
        arrival_rate_rps: toNumber(row.arrival_rate_rps),
        memory_mb: toNumber(row.memory_mb),
        reserved_concurrency: reserved || "none",
        reserved_concurrency_numeric:
          reserved && reserved !== "none" ? toNumber(reserved) : null,
        duration_minutes: durationMinutes,
        requests_completed: requestsCompleted,
        avg_latency_ms: toNumber(row.avg_latency_ms),
        p95_latency_ms: toNumber(row.p95_latency_ms),
        max_latency_ms: toNumber(row.max_latency_ms),
        error_rate_percent: toNumber(row.error_rate_percent),
        lambda_invocations: toNumber(row.lambda_invocations),
        lambda_avg_duration_ms: toNumber(row.lambda_avg_duration_ms),
        lambda_max_duration_ms: toNumber(row.lambda_max_duration_ms),
        throttles: toNumber(row.throttles),
        max_concurrency: toNumber(row.max_concurrency),
        cold_start_observed:
          row.cold_start_observed && row.cold_start_observed.trim() !== ""
            ? row.cold_start_observed.trim().toLowerCase()
            : null,
        throughput_rps:
          durationMinutes && requestsCompleted
            ? requestsCompleted / (durationMinutes * 60)
            : null,
      };
    });
}

function summarizeSeries(rows, xKey) {
  const grouped = groupBy(rows, (row) => row[xKey]);
  return [...grouped.entries()]
    .sort((a, b) => {
      if (typeof a[0] === "number" && typeof b[0] === "number") {
        return a[0] - b[0];
      }
      return String(a[0]).localeCompare(String(b[0]));
    })
    .map(([x, records]) => {
      const collect = (metric) => records.map((record) => record[metric]);
      const summarize = (metric) => {
        const values = collect(metric).filter((value) => value !== null);
        return {
          mean: round(mean(values)),
          ci95: round(ci95(values)),
          raw: values.map((value) => round(value)),
        };
      };
      return {
        x,
        run_ids: [...new Set(records.map((record) => record.run_id))],
        n: records.length,
        avg_latency_ms: summarize("avg_latency_ms"),
        p95_latency_ms: summarize("p95_latency_ms"),
        throughput_rps: summarize("throughput_rps"),
        max_concurrency: summarize("max_concurrency"),
        lambda_avg_duration_ms: summarize("lambda_avg_duration_ms"),
        lambda_max_duration_ms: summarize("lambda_max_duration_ms"),
        throttles: summarize("throttles"),
      };
    });
}

function computeStats(rows) {
  const baseline = summarizeSeries(
    rows.filter(
      (row) =>
        row.workload_type === "sustained" &&
        row.memory_mb === 128 &&
        row.reserved_concurrency === "none" &&
        ["run01", "run02", "run03", "run04", "run05", "run06"].includes(
          row.run_id
        )
    ),
    "arrival_rate_rps"
  );

  const memory = summarizeSeries(
    rows.filter(
      (row) =>
        row.workload_type === "sustained" &&
        row.arrival_rate_rps === 100 &&
        row.reserved_concurrency === "none" &&
        [128, 512, 1024].includes(row.memory_mb)
    ),
    "memory_mb"
  );

  const reserved = summarizeSeries(
    rows.filter(
      (row) =>
        row.workload_type === "sustained" &&
        row.arrival_rate_rps === 100 &&
        row.memory_mb === 128 &&
        row.reserved_concurrency !== "none"
    ),
    "reserved_concurrency_numeric"
  );

  const burst = summarizeSeries(
    rows.filter((row) => row.workload_type === "burst"),
    "memory_mb"
  );

  const workloadPattern = summarizeSeries(
    rows
      .filter((row) => row.run_id === "run06" || row.run_id === "run09")
      .map((row) => ({
        ...row,
        workload_pattern:
          row.run_id === "run06" ? "Sustained 200 rps" : "Burst ~195 rps",
      })),
    "workload_pattern"
  );

  const coldStarts = [...groupBy(rows, (row) => row.run_id).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([runId, records]) => ({
      run_id: runId,
      workload_type: records[0].workload_type,
      arrival_rate_rps: records[0].arrival_rate_rps,
      memory_mb: records[0].memory_mb,
      reserved_concurrency: records[0].reserved_concurrency,
      observed_yes: records.filter(
        (record) => record.cold_start_observed === "yes"
      ).length,
      observed_no: records.filter((record) => record.cold_start_observed === "no")
        .length,
      missing: records.filter((record) => record.cold_start_observed === null)
        .length,
    }));

  return {
    dataset: {
      total_runs: 14,
      total_records: rows.length,
      repetitions_per_configuration: 3,
      t_critical_95_df2: T_CRIT_95_DF2,
    },
    baseline,
    memory,
    reserved,
    burst,
    workloadPattern,
    coldStarts,
  };
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function niceStep(rawStep) {
  const exponent = Math.floor(Math.log10(rawStep || 1));
  const fraction = rawStep / 10 ** exponent;
  let niceFraction = 1;
  if (fraction <= 1) {
    niceFraction = 1;
  } else if (fraction <= 2) {
    niceFraction = 2;
  } else if (fraction <= 5) {
    niceFraction = 5;
  } else {
    niceFraction = 10;
  }
  return niceFraction * 10 ** exponent;
}

function buildNiceTicks(min, max, targetCount = 5) {
  if (min === max) {
    return [min];
  }
  const step = niceStep((max - min) / Math.max(targetCount - 1, 1));
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}

function createSvg(width, height, body) {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<style>
      text { font-family: Arial, Helvetica, sans-serif; fill: #1f2937; }
      .title { font-size: 17px; font-weight: 700; }
      .axis-label { font-size: 12px; font-weight: 600; }
      .tick { font-size: 10px; fill: #4b5563; }
      .panel-title { font-size: 13px; font-weight: 700; }
      .grid { stroke: #e5e7eb; stroke-width: 1; }
      .axis { stroke: #6b7280; stroke-width: 1.2; }
      .series { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
      .marker { stroke-width: 1.5; }
      .raw-point { opacity: 0.65; }
    </style>`,
    body,
    `</svg>`,
  ].join("\n");
}

function createArchitectureSvg() {
  const width = 1200;
  const height = 360;
  const parts = [
    `<defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
      </marker>
    </defs>`,
    `<style>
      text { font-family: Arial, Helvetica, sans-serif; fill: #1f2937; }
      .label { font-size: 15px; font-weight: 700; }
      .sub { font-size: 12px; fill: #374151; }
      .edge { stroke: #6b7280; stroke-width: 2.5; fill: none; marker-end: url(#arrow); }
      .box { rx: 16; ry: 16; stroke-width: 2; }
    </style>`,
    `<rect class="box" x="50" y="120" width="220" height="90" fill="#dbeafe" stroke="#2563eb" />`,
    `<text class="label" x="160" y="155" text-anchor="middle">k6 Load Generator</text>`,
    `<text class="sub" x="160" y="178" text-anchor="middle">Separate client machine</text>`,
    `<text class="sub" x="160" y="198" text-anchor="middle">Sustained and burst workloads</text>`,
    `<rect class="box" x="340" y="120" width="220" height="90" fill="#e0f2fe" stroke="#0284c7" />`,
    `<text class="label" x="450" y="155" text-anchor="middle">Amazon API Gateway</text>`,
    `<text class="sub" x="450" y="178" text-anchor="middle">HTTP ingress</text>`,
    `<text class="sub" x="450" y="198" text-anchor="middle">Routes requests to Lambda</text>`,
    `<rect class="box" x="630" y="120" width="240" height="90" fill="#dcfce7" stroke="#16a34a" />`,
    `<text class="label" x="750" y="155" text-anchor="middle">AWS Lambda Function</text>`,
    `<text class="sub" x="750" y="178" text-anchor="middle">Node.js handler</text>`,
    `<text class="sub" x="750" y="198" text-anchor="middle">JSON parsing + lightweight compute</text>`,
    `<rect class="box" x="940" y="45" width="210" height="90" fill="#fef3c7" stroke="#d97706" />`,
    `<text class="label" x="1045" y="80" text-anchor="middle">Amazon CloudWatch</text>`,
    `<text class="sub" x="1045" y="103" text-anchor="middle">Invocations, duration,</text>`,
    `<text class="sub" x="1045" y="123" text-anchor="middle">concurrency, throttles</text>`,
    `<rect class="box" x="940" y="225" width="210" height="70" fill="#f3e8ff" stroke="#9333ea" />`,
    `<text class="label" x="1045" y="258" text-anchor="middle">HTTP Response</text>`,
    `<text class="sub" x="1045" y="280" text-anchor="middle">Returned to the client</text>`,
    `<path class="edge" d="M 270 165 L 340 165" />`,
    `<path class="edge" d="M 560 165 L 630 165" />`,
    `<path class="edge" d="M 870 165 L 940 165 L 940 260" />`,
    `<path class="edge" d="M 870 150 L 940 150 L 940 90" />`,
    `<text class="sub" x="595" y="145" text-anchor="middle">Request flow</text>`,
    `<text class="sub" x="920" y="73" text-anchor="end">Metrics</text>`,
    `<text class="sub" x="920" y="244" text-anchor="end">Result</text>`,
  ];
  return createSvg(width, height, parts.join("\n"));
}

function linePath(points) {
  if (points.length === 0) {
    return "";
  }
  return points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    )
    .join(" ");
}

function renderPanel(config) {
  const {
    x,
    y,
    ci,
    rawPoints,
    bounds,
    title,
    xLabel,
    yLabel,
    color,
    xType = "numeric",
    connect = true,
    forceZeroY = false,
    xTickFormatter = (value) => value,
    yTickFormatter = (value) => value,
  } = config;

  const margin = { top: 26, right: 16, bottom: 42, left: 58 };
  const left = bounds.x + margin.left;
  const top = bounds.y + margin.top;
  const width = bounds.width - margin.left - margin.right;
  const height = bounds.height - margin.top - margin.bottom;

  const allY = [];
  y.forEach((value, index) => {
    allY.push(value);
    if (ci) {
      allY.push(Math.max(0, value - ci[index]));
      allY.push(value + ci[index]);
    }
    if (rawPoints && rawPoints[index]) {
      rawPoints[index].forEach((point) => allY.push(point));
    }
  });
  let yMinRaw = forceZeroY ? 0 : Math.min(...allY);
  let yMaxRaw = Math.max(...allY);
  if (yMinRaw === yMaxRaw) {
    yMinRaw -= 1;
    yMaxRaw += 1;
  } else {
    const pad = (yMaxRaw - yMinRaw) * 0.08;
    yMinRaw = forceZeroY ? 0 : yMinRaw - pad;
    yMaxRaw += pad;
  }

  const yTicks = buildNiceTicks(yMinRaw, yMaxRaw, 5);
  const yMin = Math.min(...yTicks);
  const yMax = Math.max(...yTicks);

  const yScale = (value) =>
    top + height - ((value - yMin) / (yMax - yMin)) * height;

  let xScale;
  let xTicks = [];
  if (xType === "numeric") {
    const xMin = Math.min(...x);
    const xMax = Math.max(...x);
    const domainMin = xMin === xMax ? xMin - 1 : xMin;
    const domainMax = xMin === xMax ? xMax + 1 : xMax;
    xScale = (value) =>
      left + ((value - domainMin) / (domainMax - domainMin)) * width;
    xTicks = x;
  } else {
    const step = width / x.length;
    xScale = (_, index) => left + step * index + step / 2;
    xTicks = x;
  }

  const pointCoords = x.map((value, index) => ({
    x: xType === "numeric" ? xScale(value) : xScale(value, index),
    y: yScale(y[index]),
  }));

  const parts = [];
  parts.push(
    `<text class="panel-title" x="${bounds.x + bounds.width / 2}" y="${
      bounds.y + 16
    }" text-anchor="middle">${escapeXml(title)}</text>`
  );

  yTicks.forEach((tick) => {
    const yPos = yScale(tick);
    parts.push(
      `<line class="grid" x1="${left}" y1="${yPos.toFixed(2)}" x2="${
        left + width
      }" y2="${yPos.toFixed(2)}" />`
    );
    parts.push(
      `<text class="tick" x="${left - 8}" y="${(yPos + 3).toFixed(
        2
      )}" text-anchor="end">${escapeXml(yTickFormatter(round(tick, 2)))}</text>`
    );
  });

  xTicks.forEach((tick, index) => {
    const xPos = xType === "numeric" ? xScale(tick) : xScale(tick, index);
    parts.push(
      `<line class="grid" x1="${xPos.toFixed(2)}" y1="${top}" x2="${xPos.toFixed(
        2
      )}" y2="${top + height}" />`
    );
    parts.push(
      `<text class="tick" x="${xPos.toFixed(2)}" y="${top + height + 16}" text-anchor="middle">${escapeXml(
        xTickFormatter(tick)
      )}</text>`
    );
  });

  parts.push(
    `<line class="axis" x1="${left}" y1="${top + height}" x2="${left + width}" y2="${
      top + height
    }" />`
  );
  parts.push(
    `<line class="axis" x1="${left}" y1="${top}" x2="${left}" y2="${
      top + height
    }" />`
  );

  if (connect) {
    parts.push(
      `<path class="series" stroke="${color}" d="${linePath(pointCoords)}" />`
    );
  }

  if (rawPoints) {
    rawPoints.forEach((values, index) => {
      const baseX = pointCoords[index].x;
      values.forEach((value, rawIndex) => {
        const jitter = values.length === 1 ? 0 : (rawIndex - (values.length - 1) / 2) * 8;
        parts.push(
          `<circle class="raw-point" cx="${(baseX + jitter).toFixed(2)}" cy="${yScale(
            value
          ).toFixed(2)}" r="3.6" fill="${color}" />`
        );
      });
    });
  }

  if (ci) {
    ci.forEach((value, index) => {
      const cx = pointCoords[index].x;
      const yHigh = yScale(y[index] + value);
      const yLow = yScale(Math.max(0, y[index] - value));
      parts.push(
        `<line x1="${cx.toFixed(2)}" y1="${yHigh.toFixed(2)}" x2="${cx.toFixed(
          2
        )}" y2="${yLow.toFixed(2)}" stroke="${color}" stroke-width="1.4" />`
      );
      parts.push(
        `<line x1="${(cx - 5).toFixed(2)}" y1="${yHigh.toFixed(2)}" x2="${(
          cx + 5
        ).toFixed(2)}" y2="${yHigh.toFixed(2)}" stroke="${color}" stroke-width="1.4" />`
      );
      parts.push(
        `<line x1="${(cx - 5).toFixed(2)}" y1="${yLow.toFixed(2)}" x2="${(
          cx + 5
        ).toFixed(2)}" y2="${yLow.toFixed(2)}" stroke="${color}" stroke-width="1.4" />`
      );
    });
  }

  pointCoords.forEach((point) => {
    parts.push(
      `<circle class="marker" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(
        2
      )}" r="4.2" fill="#ffffff" stroke="${color}" />`
    );
  });

  parts.push(
    `<text class="axis-label" x="${left + width / 2}" y="${bounds.y + bounds.height - 6}" text-anchor="middle">${escapeXml(
      xLabel
    )}</text>`
  );
  parts.push(
    `<text class="axis-label" transform="translate(${bounds.x + 16}, ${
      top + height / 2
    }) rotate(-90)" text-anchor="middle">${escapeXml(yLabel)}</text>`
  );

  return parts.join("\n");
}

function panelGrid(width, height, rows, columns, margin = 18, gap = 18) {
  const innerWidth = width - margin * 2 - gap * (columns - 1);
  const innerHeight = height - margin * 2 - gap * (rows - 1);
  const panelWidth = innerWidth / columns;
  const panelHeight = innerHeight / rows;
  const panels = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      panels.push({
        x: margin + col * (panelWidth + gap),
        y: margin + row * (panelHeight + gap),
        width: panelWidth,
        height: panelHeight,
      });
    }
  }
  return panels;
}

function saveSvg(filename, width, height, parts) {
  const svg = createSvg(width, height, parts.join("\n"));
  fs.writeFileSync(path.join(FIGURES_DIR, filename), svg, "utf8");
}

function generateFigures(stats) {
  fs.writeFileSync(
    path.join(FIGURES_DIR, "figure1_architecture.svg"),
    createArchitectureSvg(),
    "utf8"
  );

  const blue = "#2563eb";
  const orange = "#ea580c";
  const green = "#059669";

  const baselinePanels = panelGrid(1100, 760, 2, 2);
  saveSvg(
    "figure2_baseline_scaling.svg",
    1100,
    760,
    [
      renderPanel({
        bounds: baselinePanels[0],
        title: "Average Latency",
        x: stats.baseline.map((point) => point.x),
        y: stats.baseline.map((point) => point.avg_latency_ms.mean),
        ci: stats.baseline.map((point) => point.avg_latency_ms.ci95),
        xLabel: "Arrival Rate (requests/s)",
        yLabel: "Average Latency (ms)",
        color: blue,
        xTickFormatter: (value) => value,
      }),
      renderPanel({
        bounds: baselinePanels[1],
        title: "P95 Latency",
        x: stats.baseline.map((point) => point.x),
        y: stats.baseline.map((point) => point.p95_latency_ms.mean),
        ci: stats.baseline.map((point) => point.p95_latency_ms.ci95),
        xLabel: "Arrival Rate (requests/s)",
        yLabel: "P95 Latency (ms)",
        color: orange,
        xTickFormatter: (value) => value,
      }),
      renderPanel({
        bounds: baselinePanels[2],
        title: "Observed Throughput",
        x: stats.baseline.map((point) => point.x),
        y: stats.baseline.map((point) => point.throughput_rps.mean),
        xLabel: "Arrival Rate (requests/s)",
        yLabel: "Throughput (requests/s)",
        color: green,
        xTickFormatter: (value) => value,
        forceZeroY: true,
      }),
      renderPanel({
        bounds: baselinePanels[3],
        title: "Max Concurrent Executions",
        x: stats.baseline.map((point) => point.x),
        y: stats.baseline.map((point) => point.max_concurrency.mean),
        xLabel: "Arrival Rate (requests/s)",
        yLabel: "Concurrent Executions",
        color: blue,
        xTickFormatter: (value) => value,
        forceZeroY: true,
      }),
    ]
  );

  const memoryPanels = panelGrid(1200, 390, 1, 3);
  saveSvg(
    "figure3_memory_sensitivity.svg",
    1200,
    390,
    [
      renderPanel({
        bounds: memoryPanels[0],
        title: "Average Latency",
        x: stats.memory.map((point) => point.x),
        y: stats.memory.map((point) => point.avg_latency_ms.mean),
        ci: stats.memory.map((point) => point.avg_latency_ms.ci95),
        xLabel: "Memory (MB)",
        yLabel: "Average Latency (ms)",
        color: blue,
        xType: "category",
      }),
      renderPanel({
        bounds: memoryPanels[1],
        title: "P95 Latency",
        x: stats.memory.map((point) => point.x),
        y: stats.memory.map((point) => point.p95_latency_ms.mean),
        ci: stats.memory.map((point) => point.p95_latency_ms.ci95),
        xLabel: "Memory (MB)",
        yLabel: "P95 Latency (ms)",
        color: orange,
        xType: "category",
      }),
      renderPanel({
        bounds: memoryPanels[2],
        title: "Lambda Average Duration",
        x: stats.memory.map((point) => point.x),
        y: stats.memory.map((point) => point.lambda_avg_duration_ms.mean),
        ci: stats.memory.map((point) => point.lambda_avg_duration_ms.ci95),
        xLabel: "Memory (MB)",
        yLabel: "Lambda Duration (ms)",
        color: green,
        xType: "category",
        forceZeroY: true,
      }),
    ]
  );

  const reservedPanels = panelGrid(1200, 390, 1, 3);
  saveSvg(
    "figure4_reserved_concurrency.svg",
    1200,
    390,
    [
      renderPanel({
        bounds: reservedPanels[0],
        title: "P95 Latency",
        x: stats.reserved.map((point) => point.x),
        y: stats.reserved.map((point) => point.p95_latency_ms.mean),
        ci: stats.reserved.map((point) => point.p95_latency_ms.ci95),
        xLabel: "Reserved Concurrency",
        yLabel: "P95 Latency (ms)",
        color: blue,
        xType: "category",
      }),
      renderPanel({
        bounds: reservedPanels[1],
        title: "Throttles",
        x: stats.reserved.map((point) => point.x),
        y: stats.reserved.map((point) => point.throttles.mean),
        ci: stats.reserved.map((point) => point.throttles.ci95),
        rawPoints: stats.reserved.map((point) => point.throttles.raw),
        xLabel: "Reserved Concurrency",
        yLabel: "Throttles",
        color: orange,
        xType: "category",
        forceZeroY: true,
      }),
      renderPanel({
        bounds: reservedPanels[2],
        title: "Max Concurrent Executions",
        x: stats.reserved.map((point) => point.x),
        y: stats.reserved.map((point) => point.max_concurrency.mean),
        xLabel: "Reserved Concurrency",
        yLabel: "Concurrent Executions",
        color: green,
        xType: "category",
        forceZeroY: true,
      }),
    ]
  );

  const burstPanels = panelGrid(1200, 390, 1, 3);
  saveSvg(
    "figure5_burst_memory.svg",
    1200,
    390,
    [
      renderPanel({
        bounds: burstPanels[0],
        title: "Average Latency",
        x: stats.burst.map((point) => point.x),
        y: stats.burst.map((point) => point.avg_latency_ms.mean),
        ci: stats.burst.map((point) => point.avg_latency_ms.ci95),
        xLabel: "Memory (MB)",
        yLabel: "Average Latency (ms)",
        color: blue,
        xType: "category",
      }),
      renderPanel({
        bounds: burstPanels[1],
        title: "P95 Latency",
        x: stats.burst.map((point) => point.x),
        y: stats.burst.map((point) => point.p95_latency_ms.mean),
        ci: stats.burst.map((point) => point.p95_latency_ms.ci95),
        xLabel: "Memory (MB)",
        yLabel: "P95 Latency (ms)",
        color: orange,
        xType: "category",
      }),
      renderPanel({
        bounds: burstPanels[2],
        title: "Max Concurrent Executions",
        x: stats.burst.map((point) => point.x),
        y: stats.burst.map((point) => point.max_concurrency.mean),
        ci: stats.burst.map((point) => point.max_concurrency.ci95),
        xLabel: "Memory (MB)",
        yLabel: "Concurrent Executions",
        color: green,
        xType: "category",
        forceZeroY: true,
      }),
    ]
  );

  const workloadPanels = panelGrid(1200, 390, 1, 3);
  saveSvg(
    "figure6_workload_pattern.svg",
    1200,
    390,
    [
      renderPanel({
        bounds: workloadPanels[0],
        title: "Average Latency",
        x: stats.workloadPattern.map((point) => point.x),
        y: stats.workloadPattern.map((point) => point.avg_latency_ms.mean),
        ci: stats.workloadPattern.map((point) => point.avg_latency_ms.ci95),
        xLabel: "Workload Pattern",
        yLabel: "Average Latency (ms)",
        color: blue,
        xType: "category",
      }),
      renderPanel({
        bounds: workloadPanels[1],
        title: "P95 Latency",
        x: stats.workloadPattern.map((point) => point.x),
        y: stats.workloadPattern.map((point) => point.p95_latency_ms.mean),
        ci: stats.workloadPattern.map((point) => point.p95_latency_ms.ci95),
        xLabel: "Workload Pattern",
        yLabel: "P95 Latency (ms)",
        color: orange,
        xType: "category",
      }),
      renderPanel({
        bounds: workloadPanels[2],
        title: "Max Concurrent Executions",
        x: stats.workloadPattern.map((point) => point.x),
        y: stats.workloadPattern.map((point) => point.max_concurrency.mean),
        ci: stats.workloadPattern.map((point) => point.max_concurrency.ci95),
        xLabel: "Workload Pattern",
        yLabel: "Concurrent Executions",
        color: green,
        xType: "category",
        forceZeroY: true,
      }),
    ]
  );
}

function main() {
  fs.mkdirSync(FIGURES_DIR, { recursive: true });
  fs.mkdirSync(REPORT_ASSETS_DIR, { recursive: true });

  const rows = loadRows();
  const stats = computeStats(rows);

  fs.writeFileSync(
    path.join(REPORT_ASSETS_DIR, "final_report_stats.json"),
    `${JSON.stringify(stats, null, 2)}\n`,
    "utf8"
  );

  generateFigures(stats);

  console.log("Generated report assets:");
  console.log(` - ${path.relative(REPO_ROOT, REPORT_ASSETS_DIR)}\\final_report_stats.json`);
  console.log(
    ` - ${path.relative(REPO_ROOT, FIGURES_DIR)}\\figure2_baseline_scaling.svg`
  );
  console.log(
    ` - ${path.relative(REPO_ROOT, FIGURES_DIR)}\\figure3_memory_sensitivity.svg`
  );
  console.log(
    ` - ${path.relative(REPO_ROOT, FIGURES_DIR)}\\figure4_reserved_concurrency.svg`
  );
  console.log(` - ${path.relative(REPO_ROOT, FIGURES_DIR)}\\figure5_burst_memory.svg`);
  console.log(
    ` - ${path.relative(REPO_ROOT, FIGURES_DIR)}\\figure6_workload_pattern.svg`
  );
}

main();
