from datetime import datetime
from meteostat import Stations, Daily

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
