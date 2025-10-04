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
                elif day_of_week == 5:  # Saturday
                    mean_traffic = saturday_avg
                else:  # Sunday
                    mean_traffic = sunday_avg
                
                # Generate a random traffic value from a normal distribution
                std_dev = mean_traffic * std_dev_percentage
                traffic = np.random.normal(mean_traffic, std_dev)
                
                # Ensure traffic is not negative
                traffic = max(0, traffic)

                daily_data.append({
                    'date': date,
                    'measuring_station': station,
                    'traffic': traffic
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

if __name__ == '__main__':
    # Define the input and output file paths
    historical_data_file = 'sensors_data/historical_traffic/history_traffic.csv'
    generated_data_file = 'sensors_data/historical_traffic/daily_traffic.csv'
    
    # Generate the data
    generate_daily_traffic_data(historical_data_file, generated_data_file)
