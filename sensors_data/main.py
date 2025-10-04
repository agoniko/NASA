import pandas as pd
import numpy as np
import calendar
from datetime import datetime
from meteostat import Stations, Daily
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score, mean_squared_error
import matplotlib.pyplot as plt
import joblib
import os

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

def fetch_weather_data_meteostat(latitude, longitude, start_date, end_date):
    """
    Fetches daily weather data using Meteostat.
    """
    # Find nearest station
    stations = Stations()
    stations = stations.nearby(latitude, longitude)
    station = stations.fetch(1)

    # Get daily data
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')
    
    data = Daily(station, start, end)
    data = data.fetch()
    
    # Reset index to make 'time' a column
    data.reset_index(inplace=True)
    
    return data

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
    
    # Aggregate traffic data by date
    daily_traffic_df = traffic_df.groupby('date')['traffic'].sum().reset_index()
    
    # Merge datasets
    merged_df = pd.merge(daily_traffic_df, pollution_df, on='date', how='inner')
    
    # Convert weather 'time' column to datetime and merge
    weather_df.rename(columns={'time': 'date'}, inplace=True)
    weather_df['date'] = pd.to_datetime(weather_df['date'])
    final_df = pd.merge(merged_df, weather_df, on='date', how='inner')
    
    return final_df

def train_pollution_model(df, target_pollutant='no2'):
    """
    Trains a model to predict a target pollutant and evaluates it.
    """
    # Prepare data
    features = ['traffic', 'tavg', 'tmin', 'tmax', 'prcp', 'wspd', 'pres']
    df = df.dropna(subset=[target_pollutant] + features)

    if df.empty:
        print(f"Skipping model training for {target_pollutant} due to insufficient data after cleaning.")
        return None
    
    X = df[features]
    y = df[target_pollutant]
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Train model
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    
    # Evaluate model
    predictions = model.predict(X_test)
    mae = mean_absolute_error(y_test, predictions)
    r2 = r2_score(y_test, predictions)
    mse = mean_squared_error(y_test, predictions)
    rmse = np.sqrt(mse)

    print(f"Model for {target_pollutant} trained.")
    print(f"Mean Absolute Error: {mae}")
    print(f"Mean Squared Error: {mse}")
    print(f"Root Mean Squared Error: {rmse}")
    print(f"R-squared: {r2}")

    # Plot predictions vs actual
    plt.figure(figsize=(10, 6))
    plt.scatter(y_test, predictions, alpha=0.5)
    plt.plot([y_test.min(), y_test.max()], [y_test.min(), y_test.max()], 'r--', lw=2)
    plt.xlabel("Actual")
    plt.ylabel("Predicted")
    plt.title(f"Actual vs. Predicted for {target_pollutant}")
    plt.savefig(f'sensors_data/models/{target_pollutant}_prediction_vs_actual.png')
    plt.close()

    # Feature importance
    feature_importances = pd.DataFrame(model.feature_importances_, index=features, columns=['importance']).sort_values('importance', ascending=False)
    print("\nFeature Importances:")
    print(feature_importances)
    
    # Save model
    model_filename = f'sensors_data/models/{target_pollutant}_prediction_model.joblib'
    joblib.dump(model, model_filename)
    print(f"\nModel saved to {model_filename}")
    
    return model

if __name__ == '__main__':
    # Define file paths and parameters
    historical_data_file = 'sensors_data/historical_traffic/history_traffic.csv'
    generated_data_file = 'sensors_data/historical_traffic/daily_traffic.csv'
    pollution_data_file = 'sensors_data/pollution_daily/zurich-kaserne-air-quality.csv'
    
    # Generate daily traffic data if it doesn't exist
    try:
        pd.read_csv(generated_data_file)
    except FileNotFoundError:
        generate_daily_traffic_data(historical_data_file, generated_data_file)

    # Zurich coordinates
    latitude = 47.3769
    longitude = 8.5417
    
    # Fetch weather data for 2025
    weather_df = fetch_weather_data_meteostat(latitude, longitude, "2025-01-01", "2025-12-31")
    
    # Load and merge all data
    combined_df = load_and_merge_data(generated_data_file, pollution_data_file, weather_df)
    
    print("Columns in combined_df:", combined_df.columns)

    # Create models directory if it doesn't exist
    os.makedirs('sensors_data/models', exist_ok=True)

    # Train models for different pollutants
    pollutants_to_predict = ['pm25', 'pm10', 'o3', 'no2', 'so2']
    for pollutant in pollutants_to_predict:
        if pollutant in combined_df.columns:
            train_pollution_model(combined_df, target_pollutant=pollutant)
