import os
import pandas as pd


def aggregate_run(file_path):
    """Reads a CSV file and returns the mean of its numeric columns."""
    df = pd.read_csv(file_path)
    return df.mean(numeric_only=True)

def aggregate_and_compare(directory='outputs/final'):
    """
    Aggregates data from multiple CSV files in a directory and creates a comparison DataFrame.
    """
    files = os.listdir(directory)
    
    methods = {
        'baseline': [f for f in files if f.startswith('baseline')],
        'ql': [f for f in files if f.startswith('pz_ql')],
        'sarsa': [f for f in files if f.startswith('sarsa')]
    }

    comparison_data = {}

    for method, file_list in methods.items():
        if not file_list:
            continue

        run_aggregates = [aggregate_run(os.path.join(directory, f)) for f in file_list]
        
        method_aggregate_df = pd.DataFrame(run_aggregates)
        
        comparison_data[method] = method_aggregate_df.mean()

    comparison_df = pd.DataFrame(comparison_data).T
    print("Aggregated Metrics Comparison:")
    print(comparison_df)
    comparison_df.to_csv('outputs/comparison.csv')
    print("\nComparison saved to outputs/comparison.csv")

if __name__ == '__main__':
    aggregate_and_compare()
