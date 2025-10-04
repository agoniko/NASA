import os
import sys

# --- 1. CONFIGURAZIONE DEI PERCORSI DI SUMO ---
# Utilizzo dell'installazione in /Applications, che ha una struttura standard.
SUMO_HOME = "/Applications/sumo-1.24.0"

# Aggiunge la directory degli strumenti di SUMO al Python Path
tools_path = os.path.join(SUMO_HOME, 'tools')
if tools_path not in sys.path:
    sys.path.append(tools_path)

# Ora che il path è impostato, possiamo importare traci
import traci

# --- 2. PARAMETRI DELLA SIMULAZIONE ---
SUMOCFG_PATH = "/Users/nicoloagostara/Sumo/2025-10-02-23-11-00/osm.sumocfg"
SIMULATION_DURATION = 7200  # Secondi
EDGE_TO_CLOSE = ["4389421#1", "580414174"]  # <-- IMPORTANTE: Sostituisci con l'ID reale del tuo edge
CLOSURE_TIME = 0  # Secondi

def run_simulation():
    """
    Esegue la simulazione SUMO con la logica TraCI per la chiusura dinamica di una strada.
    """
    # Comando per avviare SUMO con il percorso assoluto e corretto dell'eseguibile
    sumo_executable = "/Applications/SUMO sumo-gui.app/Contents/MacOS/SUMO sumo-gui"
    sumo_cmd = [sumo_executable, "-c", SUMOCFG_PATH]

    # Verifica che l'eseguibile di SUMO esista
    if not os.path.exists(sumo_executable):
        print(f"ERRORE: L'eseguibile di SUMO non è stato trovato in '{sumo_executable}'")
        return

    print("Avvio della simulazione SUMO con TraCI...")
    traci.start(sumo_cmd)

    step = 0

    edge_closed = False

    try:
        while step < SIMULATION_DURATION:
            traci.simulationStep()

            # Logica per la chiusura della strada al tempo specificato
            if not edge_closed and traci.simulation.getTime() >= CLOSURE_TIME:
                print(f"--- Tempo di simulazione: {traci.simulation.getTime()}s ---")
                print(f"Chiusura della strada: {EDGE_TO_CLOSE}")
                
                # Impedisce a tutte le classi di veicoli di usare la strada
                for edge in EDGE_TO_CLOSE:
                    traci.edge.setDisallowed(edge, "all")
                
                print(f"La strada {EDGE_TO_CLOSE} è stata chiusa al traffico.")
                edge_closed = True

            step += 1

    except traci.TraCIException as e:
        print(f"Errore durante la simulazione TraCI: {e}")
    finally:
        print("--- Simulazione terminata ---")
        traci.close()

if __name__ == "__main__":
    # Rimuovo la stampa di prova
    # Verifica che il file di configurazione esista
    if not os.path.exists(SUMOCFG_PATH):
        print(f"ERRORE: Il file di configurazione '{SUMOCFG_PATH}' non è stato trovato.")
        print("Assicurati che il percorso sia corretto.")
    else:
        run_simulation()