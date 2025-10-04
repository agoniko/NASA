import pandas as pd

# Replace with your file path
file_path_traffic = r"sensors_data/historical_traffic/history_traffic.csv"
file_path_pollution = r"sensors_data/pollution_daily/zurich-kaserne-air-quality.csv"

# Load Excel file into DataFrame
df = pd.read_csv(file_path_pollution, sep=',')

# View first few rows
print(df)
