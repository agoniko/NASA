import argparse
import os
import sys
from datetime import datetime

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sumo-rl'))
import pandas as pd


if "SUMO_HOME" in os.environ:
    tools = os.path.join(os.environ["SUMO_HOME"], "tools")
    sys.path.append(tools)
else:
    sys.exit("Please declare the environment variable 'SUMO_HOME'")

import traci

import sumo_rl
from sumo_rl.agents import QLAgent
from sumo_rl.exploration import EpsilonGreedy


if __name__ == "__main__":
    alpha = 0.1
    gamma = 0.99
    decay = 1
    runs = 5

    env = sumo_rl.env(
        net_file="testmap2/map.net.xml",
        route_file="testmap2/map.rou.xml",
        use_gui=True,
        min_green=8,
        delta_time=5,
        num_seconds=2000,
    )
    env.reset()

    initial_states = {ts: env.observe(ts) for ts in env.agents}
    ql_agents = {
        ts: QLAgent(
            starting_state=env.unwrapped.env.encode(initial_states[ts], ts),
            state_space=env.observation_space(ts),
            action_space=env.action_space(ts),
            alpha=alpha,
            gamma=gamma,
            exploration_strategy=EpsilonGreedy(initial_epsilon=0.05, min_epsilon=0.005, decay=decay),
        )
        for ts in env.agents
    }

    for run in range(1, runs + 1):
        env.reset()

        infos = []
        for agent in env.agent_iter():
            s, r, terminated, truncated, info = env.last()
            done = terminated or truncated
            if ql_agents[agent].action is not None:
                ql_agents[agent].learn(next_state=env.unwrapped.env.encode(s, agent), reward=r)

            action = ql_agents[agent].act() if not done else None
            env.step(action)

        env.unwrapped.env.save_csv("outputs/train/pz_ql", run)

        import pickle
        print("Saving trained agents to ql_agents.pkl...")
        with open(f'weights/ql_agents_run_{run}.pkl', 'wb') as f:
            pickle.dump(ql_agents, f)
        print("Done.")
        env.close()
        
