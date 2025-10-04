
import pandas as pd
import matplotlib.pyplot as plt

# Load the data from the CSV file
file_path = '/Users/nicoloagostara/Desktop/NASA/sumo-rl/outputs/4x4/pz_ql_conn0_ep1.csv'
data = pd.read_csv(file_path)

# Plot system_mean_waiting_time
plt.figure(figsize=(12, 6))
plt.plot(data['step'], data['system_mean_waiting_time'], marker='o', linestyle='-')
plt.title('System Mean Waiting Time Over Steps')
plt.xlabel('Step')
plt.ylabel('System Mean Waiting Time (s)')
plt.grid(True)
plt.savefig('system_mean_waiting_time.png')
plt.close()

print("Generated system_mean_waiting_time.png")

# Plot system_mean_speed
plt.figure(figsize=(12, 6))
plt.plot(data['step'], data['system_mean_speed'], marker='o', linestyle='-', color='orange')
plt.title('System Mean Speed Over Steps')
plt.xlabel('Step')
plt.ylabel('System Mean Speed (m/s)')
plt.grid(True)
plt.savefig('system_mean_speed.png')
plt.close()

print("Generated system_mean_speed.png")
