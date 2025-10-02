
import sys
import os

print("--- DIAGNOSTICA AMBIENTE PYTHON PER SUMO ---")

# 1. Verifica dell'interprete Python
print(f"\n1. Versione Python: {sys.version}")
print(f"2. Eseguibile Python: {sys.executable}")

# 2. Verifica dei percorsi di SUMO
TOOLS_PATH = "/Applications/sumo-1.24.0/tools"
print(f"\n3. Percorso 'tools' di SUMO da aggiungere: {TOOLS_PATH}")

# 4. Verifica se il percorso esiste e cosa contiene
print(f"\n4. Il percorso 'tools' esiste? {os.path.exists(TOOLS_PATH)}")

if os.path.exists(TOOLS_PATH):
    try:
        print(f"   Contenuto della directory 'tools':")
        # Stampa una parte del contenuto per leggibilità
        content = os.listdir(TOOLS_PATH)
        print(f"   - Trovati {len(content)} elementi. Esempio: {content[:10]}")
        if "traci" in content:
            print("   - CONFERMATO: La directory 'traci' è presente in 'tools'.")
            
            traci_path = os.path.join(TOOLS_PATH, "traci")
            print(f"   - Il sotto-percorso 'traci' esiste? {os.path.exists(traci_path)}")
            if os.path.exists(traci_path):
                traci_content = os.listdir(traci_path)
                print(f"   - Contenuto di 'traci': {traci_content[:10]}")
                if "__init__.py" in traci_content:
                    print("   - CONFERMATO: '__init__.py' trovato in 'traci'. Il package è valido.")
                else:
                    print("   - ERRORE CRITICO: Manca '__init__.py' in 'traci'. Non è un package importabile.")

        else:
            print("   - ERRORE CRITICO: La directory 'traci' NON è presente in 'tools'.")

    except Exception as e:
        print(f"   - Errore durante la lettura della directory: {e}")

# 5. Tentativo di importazione
print("\n5. Tentativo di importare 'traci'...")
# Aggiungiamo il path
sys.path.append(TOOLS_PATH)
print(f"   - Aggiunto '{TOOLS_PATH}' a sys.path.")
print(f"   - sys.path attuale (ultimi elementi): {sys.path[-5:]}")

try:
    import traci
    print("\nRISULTATO: SUCCESSO! Il modulo 'traci' è stato importato correttamente.")
    print(f"   - Percorso del modulo traci trovato: {traci.__file__}")
except ImportError as e:
    print(f"\nRISULTATO: FALLITO. Impossibile importare 'traci'.")
    print(f"   - Errore: {e}")
except Exception as e:
    print(f"\nRISULTATO: FALLITO con un errore inaspettato.")
    print(f"   - Errore: {e}")

print("\n--- FINE DIAGNOSTICA ---")
