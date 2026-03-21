from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt


REPO_ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = REPO_ROOT / "results" / "master_results.csv"
PLOTS_DIR = REPO_ROOT / "results" / "plots"


def load_data() -> pd.DataFrame:
    df = pd.read_csv(CSV_PATH)

    # Clean possible blank rows
    df = df.dropna(how="all")

    # Force numeric columns
    numeric_cols = [
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

    # Keep only rows with actual run data
    df = df.dropna(subset=["run_id", "repetition", "workload_type"])

    # Normalize run_id just in case
    df["run_id"] = df["run_id"].astype(str).str.strip()
    df["workload_type"] = df["workload_type"].astype(str).str.strip().str.lower()
    df["reserved_concurrency"] = df["reserved_concurrency"].astype(str).str.strip().str.lower()

    return df


def save_plot(filename: str) -> Path:
    PLOTS_DIR.mkdir(parents=True, exist_ok=True)
    out = PLOTS_DIR / filename
    plt.tight_layout()
    plt.savefig(out, dpi=300, bbox_inches="tight")
    plt.close()
    return out


def aggregate_midterm_scaling(df: pd.DataFrame) -> pd.DataFrame:
    # Midterm graphs: sustained, 128 MB, unreserved, runs 01-06
    scaling = df[
        (df["workload_type"] == "sustained")
        & (df["memory_mb"] == 128)
        & (df["reserved_concurrency"] == "none")
        & (df["run_id"].isin(["run01", "run02", "run03", "run04", "run05", "run06"]))
    ].copy()

    grouped = (
        scaling.groupby("arrival_rate_rps", as_index=False)
        .agg(
            avg_latency_ms=("avg_latency_ms", "mean"),
            p95_latency_ms=("p95_latency_ms", "mean"),
            max_concurrency=("max_concurrency", "mean"),
        )
        .sort_values("arrival_rate_rps")
    )
    return grouped


def aggregate_memory(df: pd.DataFrame) -> pd.DataFrame:
    # Memory comparison at 100 rps for runs 05, 07, 08
    mem = df[
        (df["workload_type"] == "sustained")
        & (df["arrival_rate_rps"] == 100)
        & (df["reserved_concurrency"] == "none")
        & (df["memory_mb"].isin([128, 512, 1024]))
    ].copy()

    grouped = (
        mem.groupby("memory_mb", as_index=False)
        .agg(avg_latency_ms=("avg_latency_ms", "mean"))
        .sort_values("memory_mb")
    )
    return grouped


def plot_arrival_rate_vs_avg_latency(scaling: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(scaling["arrival_rate_rps"], scaling["avg_latency_ms"], marker="o")
    plt.xlabel("Arrival Rate (requests/s)")
    plt.ylabel("Average Latency (ms)")
    plt.title("Arrival Rate vs Average Latency")
    plt.grid(True, alpha=0.3)
    return save_plot("arrival_rate_vs_avg_latency.png")


def plot_arrival_rate_vs_p95_latency(scaling: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(scaling["arrival_rate_rps"], scaling["p95_latency_ms"], marker="o")
    plt.xlabel("Arrival Rate (requests/s)")
    plt.ylabel("P95 Latency (ms)")
    plt.title("Arrival Rate vs P95 Latency")
    plt.grid(True, alpha=0.3)
    return save_plot("arrival_rate_vs_p95_latency.png")


def plot_arrival_rate_vs_concurrency(scaling: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(scaling["arrival_rate_rps"], scaling["max_concurrency"], marker="o")
    plt.xlabel("Arrival Rate (requests/s)")
    plt.ylabel("Average Max Concurrent Executions")
    plt.title("Arrival Rate vs Concurrent Executions")
    plt.grid(True, alpha=0.3)
    return save_plot("arrival_rate_vs_concurrency.png")


def plot_memory_vs_latency(mem: pd.DataFrame) -> Path:
    plt.figure(figsize=(8, 5))
    plt.plot(mem["memory_mb"], mem["avg_latency_ms"], marker="o")
    plt.xlabel("Memory Allocation (MB)")
    plt.ylabel("Average Latency (ms)")
    plt.title("Memory Allocation vs Average Latency at 100 rps")
    plt.grid(True, alpha=0.3)
    return save_plot("memory_vs_avg_latency_100rps.png")


def main() -> None:
    df = load_data()

    scaling = aggregate_midterm_scaling(df)
    mem = aggregate_memory(df)

    if scaling.empty:
        raise ValueError("No scaling data found. Check master_results.csv for run01-run06 rows.")
    if mem.empty:
        raise ValueError("No memory comparison data found. Check rows for 100 rps at 128/512/1024 MB.")

    print("Midterm scaling data used:")
    print(scaling.to_string(index=False))
    print()
    print("Memory comparison data used:")
    print(mem.to_string(index=False))
    print()

    files = [
        plot_arrival_rate_vs_avg_latency(scaling),
        plot_arrival_rate_vs_p95_latency(scaling),
        plot_arrival_rate_vs_concurrency(scaling),
        plot_memory_vs_latency(mem),
    ]

    print("Saved plots:")
    for f in files:
        print(f" - {f}")


if __name__ == "__main__":
    main()