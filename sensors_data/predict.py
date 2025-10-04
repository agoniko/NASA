import pandas as pd
import joblib
from datetime import datetime
from main import fetch_weather_data_meteostat

def predict_pollution_for_simulation(total_cars, simulation_date_str):
    """
    Predicts pollution levels for a given number of cars on a specific date.

    Args:
        total_cars (int): The total number of cars for the simulation day.
        simulation_date_str (str): The date of the simulation in 'YYYY-MM-DD' format.
    """
    # --- 1. Load Trained Models ---
    pollutants = ['pm25', 'pm10', 'o3', 'no2', 'so2']
    models = {}
    for pollutant in pollutants:
        try:
            model_filename = f'sensors_data/models/{pollutant}_prediction_model.joblib'
            models[pollutant] = joblib.load(model_filename)
        except FileNotFoundError:
            print(f"Warning: Model for {pollutant} not found. Skipping.")
            continue
    
    if not models:
        print("Error: No trained models found. Please run main.py to train the models first.")
        return

    # --- 2. Get Weather Data for Simulation Date ---
    # Zurich coordinates
    latitude = 47.3769
    longitude = 8.5417
    
    try:
        weather_df = fetch_weather_data_meteostat(latitude, longitude, simulation_date_str, simulation_date_str)
        if weather_df.empty:
            print("Error: Could not fetch weather data for the specified date.")
            return
        # Get the first row of weather data for our prediction
        weather_data = weather_df.iloc[0]
    except Exception as e:
        print(f"An error occurred while fetching weather data: {e}")
        return

    # --- 3. Prepare Input Data for Prediction ---
    # The model was trained on these features, so we need to provide them in the same order.
    features = ['traffic', 'tavg', 'tmin', 'tmax', 'prcp', 'wspd', 'pres']
    
    input_data = {
        'traffic': total_cars,
        'tavg': weather_data.get('tavg', 0),
        'tmin': weather_data.get('tmin', 0),
        'tmax': weather_data.get('tmax', 0),
        'prcp': weather_data.get('prcp', 0),
        'wspd': weather_data.get('wspd', 0),
        'pres': weather_data.get('pres', 0)
    }
    
    input_df = pd.DataFrame([input_data], columns=features)

    # --- 4. Make and Display Predictions ---
    print(f"\n--- Pollution Prediction for {simulation_date_str} with {total_cars} cars ---")
    for pollutant, model in models.items():
        prediction = model.predict(input_df)
        print(f"Predicted {pollutant.upper()}: {prediction[0]:.2f} µg/m³")

if __name__ == '__main__':
    # Example usage:
    # We assume the 60,000 cars represent the total traffic for the entire day
    # to match the data the model was trained on.
    simulation_cars = 60000
    
    # We'll predict for today's date.
    simulation_date = datetime.now().strftime('%Y-%m-%d')
    
    predict_pollution_for_simulation(simulation_cars, simulation_date)
