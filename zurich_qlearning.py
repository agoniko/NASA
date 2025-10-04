import os
import sys
from datetime import datetime

# Add the sumo-rl directory to the python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'sumo-rl'))

# Set the SUMO_HOME environment variable
# Make sure this path is correct for your SUMO installation
if "SUMO_HOME" not in os.environ:
    os.environ["SUMO_HOME"] = "/Applications/sumo-1.24.0"

if "SUMO_HOME" in os.environ:
    tools = os.path.join(os.environ["SUMO_HOME"], "tools")
    sys.path.append(tools)
else:
    sys.exit("Please declare the environment variable 'SUMO_HOME'")

from sumo_rl import SumoEnvironment
from sumo_rl.agents import QLAgent
from sumo_rl.exploration import EpsilonGreedy

if __name__ == "__main__":
    # --- TRAINING PARAMETERS ---
    alpha = 0.1
    gamma = 0.99
    epsilon = 0.05
    min_epsilon = 0.005
    decay = 1.0
    runs = 1

    # --- SIMULATION PARAMETERS ---
    net_file = "2025-10-04-17-25-24/osm.net.xml.gz"
    route_file = "2025-10-04-17-25-24/osm.passenger.rou.xml"
    use_gui = False  # Set to True to watch the simulation
    num_seconds = 3600  # Total simulation time in seconds
    min_green_time = 5  # Minimum green time for a phase
    delta_time = 5  # Time in seconds between actions

    # --- OUTPUT ---
    experiment_time = str(datetime.now()).split(".")[0].replace(":", "-")
    out_csv_name = f"outputs/zurich_qlearning_{experiment_time}"

    # --- ENVIRONMENT INITIALIZATION ---
    env = SumoEnvironment(
        net_file=net_file,
        route_file=route_file,
        use_gui=use_gui,
        num_seconds=num_seconds,
        min_green=min_green_time,
        delta_time=delta_time,
        out_csv_name=out_csv_name,
        additional_sumo_cmd="--tls.discard-simple",
    )

    # --- TRAINING LOOP ---
    for run in range(runs):
        initial_states = env.reset()

        # Create a Q-learning agent for each traffic signal
        ql_agents = {
            ts: QLAgent(
                starting_state=env.encode(initial_states[ts], ts),
                state_space=env.observation_space,
                action_space=env.action_space,
                alpha=alpha,
                gamma=gamma,
                exploration_strategy=EpsilonGreedy(initial_epsilon=epsilon, min_epsilon=min_epsilon, decay=decay),
            )
            for ts in env.ts_ids
        }

        done = {"__all__": False}
        while not done["__all__"]:
            # Get actions from all agents
            actions = {ts: ql_agents[ts].act() for ts in ql_agents.keys()}

            # Step the simulation
            s, r, done, _ = env.step(action=actions)

            # Update the Q-table for each agent
            for agent_id in ql_agents.keys():
                ql_agents[agent_id].learn(next_state=env.encode(s[agent_id], agent_id), reward=r[agent_id])
        env.save_csv(out_csv_name, run)
        env.close()