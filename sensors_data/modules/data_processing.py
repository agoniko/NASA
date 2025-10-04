import pandas as pd
import numpy as np
import calendar

def generate_daily_traffic_data(input_file, output_file):
    """
    Generates daily traffic data from historical monthly averages.

    Args:
        input_file (str): Path to the input CSV file with historical data.
        output_file (str): Path to save the generated daily data.
    """
    try:
        # Load the historical data
        df = pd.read_csv(input_file, sep=';')

        # Data Cleaning
        # Drop rows with missing essential data
        df.dropna(subset=['mo-fr', 'saturdays', 'sundays', 'month'], inplace=True)
        
        # Convert month to integer
        df['month'] = pd.to_numeric(df['month'], errors='coerce').astype('Int64')
        df.dropna(subset=['month'], inplace=True)


        # Prepare a list to hold the new daily data
        daily_data = []

        # Assume a year for which to generate data, e.g., 2023
        year = 2025

        # Define a standard deviation for the traffic data generation, as a percentage of the mean
        std_dev_percentage = 0.1 

        # Iterate over each row of the dataframe, which represents a measuring station for a given month
        for _, row in df.iterrows():
            month = row['month']
            station = row['measuring station']
            
            # Get the number of days in the month
            num_days = calendar.monthrange(year, month)[1]

            # Get the average traffic for weekdays, saturdays, and sundays
            weekday_avg = row['mo-fr']
            saturday_avg = row['saturdays']
            sunday_avg = row['sundays']

            for day in range(1, num_days + 1):
                date = pd.Timestamp(year, month, day)
                day_of_week = date.dayofweek  # Monday=0, Sunday=6

                if day_of_week < 5:  # Weekday
                    mean_traffic = weekday_avg
                    # Simulate higher avg time on street during weekdays (commute)
                    avg_time = np.random.uniform(55, 65) # Around 1 hour
                elif day_of_week == 5:  # Saturday
                    mean_traffic = saturday_avg
                    # Moderate time on street for leisure/shopping
                    avg_time = np.random.uniform(40, 50)
                else:  # Sunday
                    mean_traffic = sunday_avg
                    # Lower time on street
                    avg_time = np.random.uniform(40, 50)
                
                # Generate a random traffic value from a normal distribution
                std_dev = mean_traffic * std_dev_percentage
                traffic = np.random.normal(mean_traffic, std_dev)
                
                # Ensure traffic is not negative
                traffic = max(0, traffic)

                daily_data.append({
                    'date': date,
                    'measuring_station': station,
                    'traffic': traffic,
                    'avg_time_on_street': avg_time
                })

        # Create a new dataframe with the daily data
        daily_df = pd.DataFrame(daily_data)

        # Save the new dataframe to a CSV file
        daily_df.to_csv(output_file, index=False)
        print(f"Successfully generated daily traffic data and saved to {output_file}")

    except FileNotFoundError:
        print(f"Error: The file {input_file} was not found.")
    except Exception as e:
        print(f"An error occurred: {e}")

def load_and_merge_data(traffic_file, pollution_file, weather_df):
    """
    Loads traffic and pollution data and merges them with weather data.
    """
    # Load data
    traffic_df = pd.read_csv(traffic_file, parse_dates=['date'])
    pollution_df = pd.read_csv(pollution_file, parse_dates=['date'])
    pollution_df.columns = pollution_df.columns.str.strip()

    # Clean pollutant data
    pollutant_cols = ['pm25', 'pm10', 'o3', 'no2', 'so2']
    for col in pollutant_cols:
        if col in pollution_df.columns:
            pollution_df[col] = pd.to_numeric(pollution_df[col], errors='coerce')
    
    # Aggregate traffic data by date, including the new avg_time_on_street
    daily_traffic_agg = {
        'traffic': 'sum',
        'avg_time_on_street': 'mean'
    }
    daily_traffic_df = traffic_df.groupby('date').agg(daily_traffic_agg).reset_index()
    
    # Merge datasets
    merged_df = pd.merge(daily_traffic_df, pollution_df, on='date', how='inner')
    
    # Convert weather 'time' column to datetime and merge
    weather_df.rename(columns={'time': 'date'}, inplace=True)
    weather_df['date'] = pd.to_datetime(weather_df['date'])
    final_df = pd.merge(merged_df, weather_df, on='date', how='inner')
    
    return final_df
