import os
import sys
from datetime import datetime

import fire


if "SUMO_HOME" in os.environ:
    tools = os.path.join(os.environ["SUMO_HOME"], "tools")
    sys.path.append(tools)
else:
    sys.exit("Please declare the environment variable 'SUMO_HOME'")

import traci
from linear_rl.true_online_sarsa import TrueOnlineSarsaLambda

from sumo_rl import SumoEnvironment
import pickle
import numpy as np
import pandas as pd

NUM_SECONDS=2000
def run_standard(use_gui=True, num_seconds=NUM_SECONDS):
    """
    Runs a standard SUMO simulation with fixed-time traffic lights using traci.
    """
    if use_gui:
        #sumo_binary = os.path.join(os.environ["SUMO_HOME"], "bin", "sumo-gui")
        sumo_binary = "sumo-gui"
    else:
        sumo_binary = os.path.join(os.environ["SUMO_HOME"], "bin", "sumo")

    sumo_cmd = [
        sumo_binary,
        "-n",
        "testmap2/map.net.xml",
        "-r",
        "testmap2/map.rou.xml",
        "--waiting-time-memory",
        "10000",
        "--tripinfo-output",
        "outputs/sarsa_standard_tripinfo.xml"
    ]

    traci.start(sumo_cmd)
    
    metrics = []
    num_arrived_vehicles = 0
    num_departed_vehicles = 0
    num_teleported_vehicles = 0

    step = 0
    while step < num_seconds:
        traci.simulationStep()

        num_arrived_vehicles += traci.simulation.getArrivedNumber()
        num_departed_vehicles += traci.simulation.getDepartedNumber()
        num_teleported_vehicles += traci.simulation.getEndingTeleportNumber()

        vehicles = traci.vehicle.getIDList()
        speeds = [traci.vehicle.getSpeed(vehicle) for vehicle in vehicles]
        waiting_times = [traci.vehicle.getWaitingTime(vehicle) for vehicle in vehicles]
        num_backlogged_vehicles = len(traci.simulation.getPendingVehicles())
        
        system_info = {
            "step": step,
            "system_total_running": len(vehicles),
            "system_total_backlogged": num_backlogged_vehicles,
            "system_total_stopped": sum(int(speed < 0.1) for speed in speeds),
            "system_total_arrived": num_arrived_vehicles,
            "system_total_departed": num_departed_vehicles,
            "system_total_teleported": num_teleported_vehicles,
            "system_total_waiting_time": sum(waiting_times),
            "system_mean_waiting_time": 0.0 if len(vehicles) == 0 else np.mean(waiting_times),
            "system_mean_speed": 0.0 if len(vehicles) == 0 else np.mean(speeds),
        }
        metrics.append(system_info)
        step += 1

    traci.close()

    df = pd.DataFrame(metrics)
    df.to_csv("outputs/sarsa_standard.csv", index=False)


def run_trained(run_number=1, use_gui=True):
    """
    Runs a SUMO simulation with a pre-trained SARSA agent.
    """
    out_csv = f"outputs/sarsa_trained_run_{run_number}"
    model_file = f'weights/sarsa_agents_run_{run_number}.pkl'

    with open(model_file, 'rb') as f:
        agents = pickle.load(f)

    env = SumoEnvironment(
        net_file="testmap2/map.net.xml",
        single_agent=False,
        route_file="testmap2/map.rou.xml",
        out_csv_name=out_csv,
        use_gui=use_gui,
        num_seconds=NUM_SECONDS,
        yellow_time=3,
        min_green=5,
        max_green=60,
    )

    obs = env.reset()
    done = {"__all__": False}

    while not done["__all__"]:
        actions = {ts_id: agents[ts_id].act(obs[ts_id]) for ts_id in obs.keys()}
        next_obs, r, done, _ = env.step(action=actions)
        obs = next_obs

    env.save_csv(out_csv, run_number)
    env.close()


if __name__ == "__main__":
    fire.Fire({
        'standard': run_standard,
        'trained': run_trained,
    })
