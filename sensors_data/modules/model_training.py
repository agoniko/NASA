import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score, mean_squared_error
import matplotlib.pyplot as plt
import joblib

def train_pollution_model(df, target_pollutant='no2'):
    """
    Trains a model to predict a target pollutant and evaluates it.
    """
    # Prepare data
    features = ['traffic', 'avg_time_on_street', 'tavg', 'tmin', 'tmax', 'prcp', 'wspd', 'pres']
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
