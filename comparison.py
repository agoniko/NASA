
import xml.etree.ElementTree as ET
import sys
from pathlib import Path

def analyze_tripinfos(file_path):
    """Parses a tripinfo XML file and returns a dictionary of lists for relevant data."""
    tree = ET.parse(file_path)
    root = tree.getroot()

    data = {'duration': [], 'waitingTime': [], 'timeLoss': []}
    for trip in root.findall('tripinfo'):
        data['duration'].append(float(trip.get('duration')))
        data['waitingTime'].append(float(trip.get('waitingTime')))
        data['timeLoss'].append(float(trip.get('timeLoss')))
    return data

def calculate_stats(data):
    """Calculates statistics (mean, count) for the given data."""
    stats = {}
    for key, values in data.items():
        count = len(values)
        if count > 0:
            mean = sum(values) / count
        else:
            mean = 0
        stats[key] = {'mean': mean, 'count': count}
    return stats

def main():
    if len(sys.argv) != 3:
        print("Usage: python comparison.py <baseline.xml> <eval.xml>")
        sys.exit(1)

    baseline_file = Path(sys.argv[1])
    eval_file = Path(sys.argv[2])

    if not baseline_file.is_file():
        print(f"Error: Baseline file not found at {baseline_file}")
        sys.exit(1)
    if not eval_file.is_file():
        print(f"Error: Evaluation file not found at {eval_file}")
        sys.exit(1)

    baseline_data = analyze_tripinfos(baseline_file)
    eval_data = analyze_tripinfos(eval_file)

    baseline_stats = calculate_stats(baseline_data)
    eval_stats = calculate_stats(eval_data)

    print("--- Comparison of Trip Information ---")

    print(f"\n--- Average Metrics Comparison ---")
    print(f"{ 'Metric':<15} | { 'Baseline':>12} | { 'Evaluation':>12} | { 'Improvement':>15} | { 'Improvement (%)':>18}")
    print("-" * 85)

    for metric in ['duration', 'waitingTime', 'timeLoss']:
        baseline_mean = baseline_stats[metric]['mean']
        eval_mean = eval_stats[metric]['mean']
        improvement = baseline_mean - eval_mean
        if baseline_mean > 0:
            improvement_percent = (improvement / baseline_mean) * 100
        else:
            improvement_percent = 0

        print(f"{metric:<15} | {baseline_mean:>12.2f} | {eval_mean:>12.2f} | {improvement:>15.2f} | {improvement_percent:>17.2f}%")

if __name__ == "__main__":
    main()
