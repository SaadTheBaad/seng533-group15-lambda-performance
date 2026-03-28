from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt


REPO_ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = REPO_ROOT / "results" / "master_results.csv"
PLOTS_DIR = REPO_ROOT / "results" / "plots"


def load_data() -> pd.DataFrame:
    df = pd.read_csv(CSV_PATH)

    # Drop fully empty rows
    df = df.dropna(how="all")

    # Normalize string columns
    df["run_id"] = df["run_id"].astype(str).str.strip().str.lower()
    df["workload_type"] = df["workload_type"].astype(str).str.strip().str.lower()
    df["reserved_concurrency"] = (
        df["reserved_concurrency"].astype(str).str.strip().str.lower()
    )

    # Fix typo in workload_type for run11 if present
    df["workload_type"] = df["workload_type"].replace({"sustaiined": "sustained"})

    # Force numeric columns
    numeric_cols = [
        "repetition",
        "arrival_rate_rps",
        "memory_mb",
        "duration_minutes",
        "requests_completed",
        "avg_latency_ms",
        "p95_latency_ms",
        "max_latency_ms",
        "error_rate_percent",
        "lambda_invocations",
        "lambda_avg_duration_ms",
        "lambda_max_duration_ms",
        "throttles",
        "max_concurrency",
    ]

    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Add derived throughput metric
    df["throughput_rps"] = df["requests_completed"] / (df["duration_minutes"] * 60)

    # Numeric version of reserved concurrency for sorting/plotting
    def parse_reserved(value: str):
        if value in {"none", "", "nan"}:
            return None
        try:
            return int(value)
        except ValueError:
            return None

    df["reserved_concurrency_numeric"] = df["reserved_concurrency"].apply(parse_reserved)

    return df


def save_plot(filename: str) -> Path:
    PLOTS_DIR.mkdir(parents=True, exist_ok=True)
    out = PLOTS_DIR / filename
    plt.tight_layout()
    plt.savefig(out, dpi=300, bbox_inches="tight")
    plt.close()
    return out


def aggregate_baseline_scaling(df: pd.DataFrame) -> pd.DataFrame:
    """
    Baseline scaling:
    sustained, 128 MB, unreserved, runs 01-06
    """
    baseline = df[
        (df["workload_type"] == "sustained")
        & (df["memory_mb"] == 128)
        & (df["reserved_concurrency"] == "none")
        & (df["run_id"].isin(["run01", "run02", "run03", "run04", "run05", "run06"]))
    ].copy()

    grouped = (
        baseline.groupby("arrival_rate_rps", as_index=False)
        .agg(
            avg_latency_ms=("avg_latency_ms", "mean"),
            p95_latency_ms=("p95_latency_ms", "mean"),
            throughput_rps=("throughput_rps", "mean"),
            max_concurrency=("max_concurrency", "mean"),
        )
        .sort_values("arrival_rate_rps")
    )
    return grouped


def aggregate_memory(df: pd.DataFrame) -> pd.DataFrame:
    """
    Memory comparison:
    sustained, 100 rps, unreserved, 128/512/1024 MB
    """
    mem = df[
        (df["workload_type"] == "sustained")
        & (df["arrival_rate_rps"] == 100)
        & (df["reserved_concurrency"] == "none")
        & (df["memory_mb"].isin([128, 512, 1024]))
    ].copy()

    grouped = (
        mem.groupby("memory_mb", as_index=False)
        .agg(
            avg_latency_ms=("avg_latency_ms", "mean"),
            p95_latency_ms=("p95_latency_ms", "mean"),
            throughput_rps=("throughput_rps", "mean"),
            max_concurrency=("max_concurrency", "mean"),
        )
        .sort_values("memory_mb")
    )
    return grouped


def aggregate_burst(df: pd.DataFrame) -> pd.DataFrame:
    """
    Burst comparison:
    burst workloads at 128 and 512 MB
    """
    burst = df[df["workload_type"] == "burst"].copy()

    grouped = (
        burst.groupby("memory_mb", as_index=False)
        .agg(
            avg_latency_ms=("avg_latency_ms", "mean"),
            p95_latency_ms=("p95_latency_ms", "mean"),
            throughput_rps=("throughput_rps", "mean"),
            max_concurrency=("max_concurrency", "mean"),
        )
        .sort_values("memory_mb")
    )
    return grouped


def aggregate_reserved_concurrency(df: pd.DataFrame) -> pd.DataFrame:
    """
    Reserved concurrency comparison:
    sustained, 100 rps, 128 MB, reserved = 10/50/100/300
    """
    rc = df[
        (df["workload_type"] == "sustained")
        & (df["arrival_rate_rps"] == 100)
        & (df["memory_mb"] == 128)
        & (df["reserved_concurrency"] != "none")
    ].copy()

    grouped = (
        rc.groupby("reserved_concurrency_numeric", as_index=False)
        .agg(
            avg_latency_ms=("avg_latency_ms", "mean"),
            p95_latency_ms=("p95_latency_ms", "mean"),
            throughput_rps=("throughput_rps", "mean"),
            throttles=("throttles", "mean"),
            max_concurrency=("max_concurrency", "mean"),
        )
        .sort_values("reserved_concurrency_numeric")
    )
    return grouped


def plot_arrival_rate_vs_avg_latency(baseline: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(baseline["arrival_rate_rps"], baseline["avg_latency_ms"], marker="o")
    plt.xlabel("Arrival Rate (requests/s)")
    plt.ylabel("Average Latency (ms)")
    plt.title("Arrival Rate vs Average Latency")
    plt.grid(True, alpha=0.3)
    return save_plot("final_arrival_rate_vs_avg_latency.png")


def plot_arrival_rate_vs_p95_latency(baseline: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(baseline["arrival_rate_rps"], baseline["p95_latency_ms"], marker="o")
    plt.xlabel("Arrival Rate (requests/s)")
    plt.ylabel("P95 Latency (ms)")
    plt.title("Arrival Rate vs P95 Latency")
    plt.grid(True, alpha=0.3)
    return save_plot("final_arrival_rate_vs_p95_latency.png")


def plot_arrival_rate_vs_concurrency(baseline: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(baseline["arrival_rate_rps"], baseline["max_concurrency"], marker="o")
    plt.xlabel("Arrival Rate (requests/s)")
    plt.ylabel("Average Max Concurrent Executions")
    plt.title("Arrival Rate vs Concurrent Executions")
    plt.grid(True, alpha=0.3)
    return save_plot("final_arrival_rate_vs_concurrency.png")


def plot_arrival_rate_vs_throughput(baseline: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(baseline["arrival_rate_rps"], baseline["throughput_rps"], marker="o")
    plt.xlabel("Arrival Rate (requests/s)")
    plt.ylabel("Observed Throughput (requests/s)")
    plt.title("Arrival Rate vs Observed Throughput")
    plt.grid(True, alpha=0.3)
    return save_plot("final_arrival_rate_vs_throughput.png")


def plot_memory_vs_avg_latency(mem: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(mem["memory_mb"], mem["avg_latency_ms"], marker="o")
    plt.xlabel("Memory Allocation (MB)")
    plt.ylabel("Average Latency (ms)")
    plt.title("Memory Allocation vs Average Latency at 100 rps")
    plt.grid(True, alpha=0.3)
    return save_plot("final_memory_vs_avg_latency_100rps.png")


def plot_memory_vs_p95_latency(mem: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(mem["memory_mb"], mem["p95_latency_ms"], marker="o")
    plt.xlabel("Memory Allocation (MB)")
    plt.ylabel("P95 Latency (ms)")
    plt.title("Memory Allocation vs P95 Latency at 100 rps")
    plt.grid(True, alpha=0.3)
    return save_plot("final_memory_vs_p95_latency_100rps.png")


def plot_memory_vs_concurrency(mem: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(mem["memory_mb"], mem["max_concurrency"], marker="o")
    plt.xlabel("Memory Allocation (MB)")
    plt.ylabel("Average Max Concurrent Executions")
    plt.title("Memory Allocation vs Concurrent Executions at 100 rps")
    plt.grid(True, alpha=0.3)
    return save_plot("final_memory_vs_concurrency_100rps.png")


def plot_burst_memory_vs_avg_latency(burst: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(burst["memory_mb"], burst["avg_latency_ms"], marker="o")
    plt.xlabel("Memory Allocation (MB)")
    plt.ylabel("Average Latency (ms)")
    plt.title("Burst Workload: Memory vs Average Latency")
    plt.grid(True, alpha=0.3)
    return save_plot("final_burst_memory_vs_avg_latency.png")


def plot_burst_memory_vs_p95_latency(burst: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(burst["memory_mb"], burst["p95_latency_ms"], marker="o")
    plt.xlabel("Memory Allocation (MB)")
    plt.ylabel("P95 Latency (ms)")
    plt.title("Burst Workload: Memory vs P95 Latency")
    plt.grid(True, alpha=0.3)
    return save_plot("final_burst_memory_vs_p95_latency.png")


def plot_burst_memory_vs_concurrency(burst: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(burst["memory_mb"], burst["max_concurrency"], marker="o")
    plt.xlabel("Memory Allocation (MB)")
    plt.ylabel("Average Max Concurrent Executions")
    plt.title("Burst Workload: Memory vs Concurrent Executions")
    plt.grid(True, alpha=0.3)
    return save_plot("final_burst_memory_vs_concurrency.png")


def plot_reserved_concurrency_vs_avg_latency(rc: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(rc["reserved_concurrency_numeric"], rc["avg_latency_ms"], marker="o")
    plt.xlabel("Reserved Concurrency")
    plt.ylabel("Average Latency (ms)")
    plt.title("Reserved Concurrency vs Average Latency at 100 rps")
    plt.grid(True, alpha=0.3)
    return save_plot("final_reserved_concurrency_vs_avg_latency.png")


def plot_reserved_concurrency_vs_p95_latency(rc: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(rc["reserved_concurrency_numeric"], rc["p95_latency_ms"], marker="o")
    plt.xlabel("Reserved Concurrency")
    plt.ylabel("P95 Latency (ms)")
    plt.title("Reserved Concurrency vs P95 Latency at 100 rps")
    plt.grid(True, alpha=0.3)
    return save_plot("final_reserved_concurrency_vs_p95_latency.png")


def plot_reserved_concurrency_vs_throttles(rc: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(rc["reserved_concurrency_numeric"], rc["throttles"], marker="o")
    plt.xlabel("Reserved Concurrency")
    plt.ylabel("Average Throttles")
    plt.title("Reserved Concurrency vs Throttles at 100 rps")
    plt.grid(True, alpha=0.3)
    return save_plot("final_reserved_concurrency_vs_throttles.png")


def plot_reserved_concurrency_vs_concurrency(rc: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(rc["reserved_concurrency_numeric"], rc["max_concurrency"], marker="o")
    plt.xlabel("Reserved Concurrency")
    plt.ylabel("Average Max Concurrent Executions")
    plt.title("Reserved Concurrency vs Concurrent Executions at 100 rps")
    plt.grid(True, alpha=0.3)
    return save_plot("final_reserved_concurrency_vs_concurrent_executions.png")


def plot_reserved_concurrency_vs_throughput(rc: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(rc["reserved_concurrency_numeric"], rc["throughput_rps"], marker="o")
    plt.xlabel("Reserved Concurrency")
    plt.ylabel("Observed Throughput (requests/s)")
    plt.title("Reserved Concurrency vs Observed Throughput at 100 rps")
    plt.grid(True, alpha=0.3)
    return save_plot("final_reserved_concurrency_vs_throughput.png")


def main() -> None:
    df = load_data()

    baseline = aggregate_baseline_scaling(df)
    mem = aggregate_memory(df)
    burst = aggregate_burst(df)
    rc = aggregate_reserved_concurrency(df)

    if baseline.empty:
        raise ValueError("No baseline scaling data found.")
    if mem.empty:
        raise ValueError("No memory comparison data found.")
    if burst.empty:
        raise ValueError("No burst data found.")
    if rc.empty:
        raise ValueError("No reserved concurrency data found.")

    print("Baseline scaling data:")
    print(baseline.to_string(index=False))
    print()

    print("Memory comparison data:")
    print(mem.to_string(index=False))
    print()

    print("Burst comparison data:")
    print(burst.to_string(index=False))
    print()

    print("Reserved concurrency data:")
    print(rc.to_string(index=False))
    print()

    files = [
        plot_arrival_rate_vs_avg_latency(baseline),
        plot_arrival_rate_vs_p95_latency(baseline),
        plot_arrival_rate_vs_concurrency(baseline),
        plot_arrival_rate_vs_throughput(baseline),
        plot_memory_vs_avg_latency(mem),
        plot_memory_vs_p95_latency(mem),
        plot_memory_vs_concurrency(mem),
        plot_burst_memory_vs_avg_latency(burst),
        plot_burst_memory_vs_p95_latency(burst),
        plot_burst_memory_vs_concurrency(burst),
        plot_reserved_concurrency_vs_avg_latency(rc),
        plot_reserved_concurrency_vs_p95_latency(rc),
        plot_reserved_concurrency_vs_throttles(rc),
        plot_reserved_concurrency_vs_concurrency(rc),
        plot_reserved_concurrency_vs_throughput(rc),
    ]

    print("Saved plots:")
    for f in files:
        print(f" - {f}")


if __name__ == "__main__":
    main()