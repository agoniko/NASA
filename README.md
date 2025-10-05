# 🚦 Smarter Urban Planning & Navigation for Zurich

Project for NASA Space Apps Challenge 2025 – Zurich

"How might we help cities like Zurich anticipate the impact of street closures or events and adapt traffic & pollution proactively?"

## 1. 🌍 What This Project Does 
We built an end‑to‑end decision support prototype that lets a city planner or operations team:
1. 🗺️ Select streets they may want to close (construction, parade, emergency) directly on an interactive map.
2. 🧠 Instantly see the relative traffic importance and estimated disruption profile of those segments.
3. 🤖 Run a two‑phase simulation (baseline vs closure) with reinforcement learning agents to explore adaptive signal control & routing.
4. 🌫️ Estimate resulting changes in travel efficiency and environmental impact (pollution indicators).
5. ♻️ Compare an optional "optimization" scenario showing how smarter adaptive strategies could mitigate negative effects.

It’s a practical, visual, data‐driven assistant for “What happens if…?” questions in urban mobility.

## 2. 🧱 High-Level Architecture
### A. 🖥️ Web App (React + MapLibre)
- Clean, hackathon‑ready UI: select road segments by clicking directly on a Zürich basemap.
- Shows length, relative vehicle exposure, and an impact categorization (from low to extreme) for chosen segments.
- Simulated phases: Baseline → Closures → (Optional) Optimization.
- Designed for explainability: panels present before/after KPIs (travel time, delay, speed, queues, estimated emissions deltas).
- Zero vendor lock-in: uses open OSM raster tiles + MapLibre (no proprietary tokens required by default).

### B. 🚦 Traffic Optimization Engine (SUMO + Reinforcement Learning)
- Uses SUMO (Simulation of Urban Mobility) to model network behavior.
- Two learning approaches included:
  * 🔢 Q-Learning (`train_ql.py`) – tabular style for small test networks.
  * λ True Online SARSA(λ) (`train_sarsa.py`) – function approximation variant for smoother adaptation.
- Agents learn signal control policies to reduce delay / improve flow.
- Supports saving and reloading trained policies (`weights/` directory) to compare baseline vs adaptive behavior.
- Additional script (`zurich_sim.py`) illustrates edge manipulation (e.g., simulating closure of specific edges via TraCI API).

### C. 🌿 Pollution & Environmental Impact Models (`sensors_data/`)
- Fuses synthetic daily traffic exposure + historical pollution + real weather (via Meteostat) to train lightweight Random Forest regressors per pollutant.
- Predicts indicative levels for: PM2.5, PM10, O₃, NO₂, SO₂.
- Features used: traffic volume, avg vehicle circulation time, temperature, precipitation, wind, pressure.
- Provides quick scenario predictions (e.g., "If today 60k vehicles circulate 60 min on average...").
- Focus: directional insight (better / worse) over strict regulatory precision.

## 3. 📊 Data & Inputs
| Domain | Source / Method | Notes |
|--------|-----------------|-------|
| Road network | OpenStreetMap extracts | Parsed client-side to GeoJSON for interaction. |
| Traffic volumes | Synthetic daily generation from monthly station averages | Adds variability & weekday/weekend patterns. |
| Weather | Meteostat API (nearest Zürich station) | Daily aggregates (temp, wind, precipitation, pressure). |
| Pollution | Provided CSV (e.g., `zurich-kaserne-air-quality.csv`) | Trains per‑pollutant regressors. |
| Simulation | SUMO test networks (`testmap2/`, etc.) | Expandable to full Zürich network. |

## 4. 🧭 Typical User Flow
1. Open the web UI and pan/zoom to the area of interest.
2. Click street segments to build a “closure set”.
3. Review immediate impact stats (length, exposure share, qualitative impact badges).
4. Launch simulation → Baseline phase calibrates; Closure phase evaluates disruption.
5. View KPI deltas (travel time, delay, speed, queues, indicative emissions).
6. (Optional) Run optimization (adaptive re‑routing + timing heuristics idea).
7. Export edge list for integration into municipal workflows.

## 5. 📐 Key Metrics
- ⏱️ Avg Travel Time / Delay per vehicle
- 🚗 Queue Delay (avg / max)
- ⚡ Average Speed (km/h)
- 📏 Vehicle Kilometers Traveled (VKT) & Vehicle Hours Traveled (VHT)
- 🌫️ Indicative pollutant trends (e.g., PM2.5 ↓2.5% after optimization)


## 6. 🛠️ Reproducibility & Running
### A. Web App
```bash
cd react-project/hack_nasa_traffic_manager
npm install
npm start
```
Open http://localhost:3000

### B. RL Training Examples
Ensure SUMO is installed and `SUMO_HOME` is set.
```bash
python train_ql.py                 # Q-Learning small map
python train_sarsa.py run --runs=3 # SARSA(λ) multi-agent
```
Trained weights land in `weights/`.

### C. Pollution Model Training
```bash
cd sensors_data
pip install -r requirements.txt
python main.py     # trains models & saves to sensors_data/models/
python predict.py  # sample scenario predictions
```

## 7. 🧭 Design Principles
- 👥 Human-in-the-loop over opaque automation.
- 🔁 Modular pillars (UI / RL / Pollution) evolve independently.
- 🌐 Open data leverage (OSM + Meteostat + synthetic augmentation).
- ⚡ Fast iteration, clear extension paths.

## 8. ⚖️ Limitations (Transparent View)
| Area | Current Constraint | Future Improvement |
|------|--------------------|--------------------|
| Network scale | Demo/test map subset | Integrate full Zürich OSM → SUMO conversion. |
| Pollution accuracy | Simplified regressors | Add dispersion modeling & higher-frequency traffic inputs. |
| RL realism | Basic reward signals | Multi-objective (emissions + equity + delay) & graph RL. |
| Map selection | Client-side only | Backend service to persist & share scenarios. |
| Optimization | Synthetic heuristic demo | Integrate live re-routing + adaptive response engine. |

## 9. 🚀 Extensibility Roadmap
Near-term ideas:
- Batch scenario comparison dashboard.
- Live ingestion of sensor feeds (traffic counters, AQ stations).
- Events calendar → pre-emptive closure suggestions.
- Health & cost overlay (exposure / externalities).
- Federated district-level adaptive policies.

## 10. 📁 Repository Guide
| Path | Purpose |
|------|---------|
| `react-project/hack_nasa_traffic_manager/` | Front-end map + scenario analysis UI. |
| `train_ql.py`, `train_sarsa.py` | RL training scripts for signal control agents. |
| `weights/` | Saved agent policies per run. |
| `sensors_data/` | Pollution model data prep & training pipeline. |
| `testmap2/` | Example SUMO network for experiments. |
| `outputs/` | CSV exports from simulations & training runs. |
| `zurich_sim.py` | Example manual edge closure simulation via TraCI. |

## 12. 🙌 Credits & Open Source
- SUMO (Eclipse) – traffic simulation
- Meteostat – weather data
- OpenStreetMap contributors – geospatial base
- scikit-learn / pandas / numpy – data + modeling
- MapLibre – map rendering

MIT-style open usage anticipated (confirm before public release).

