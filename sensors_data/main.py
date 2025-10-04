import pandas as pd
import os
from modules.data_processing import generate_daily_traffic_data, load_and_merge_data
from modules.weather import fetch_weather_data_meteostat
from modules.model_training import train_pollution_model

if __name__ == '__main__':
    # Define file paths and parameters
    historical_data_file = 'sensors_data/historical_traffic/history_traffic.csv'
    generated_data_file = 'sensors_data/historical_traffic/daily_traffic.csv'
    pollution_data_file = 'sensors_data/pollution_daily/zurich-kaserne-air-quality.csv'
    
    # Always regenerate daily traffic data to ensure it includes the latest features
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
