import pandas as pd

# Replace with your file path
file_path = r"satellite_ingestion/historical_traffic/history_traffic.csv"

# Load Excel file into DataFrame
df = pd.read_csv(file_path, sep=';')

# View first few rows
print(df)
