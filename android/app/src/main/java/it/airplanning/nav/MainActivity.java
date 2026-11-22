// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
package it.airplanning.nav;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // modulo proprio dell'app: aggiornamento automatico (AggiornamentiPlugin)
        registerPlugin(AggiornamentiPlugin.class);
        // avvisi a voce nativi (la WebView non ha la sintesi vocale del web)
        registerPlugin(VocePlugin.class);
        // posizione dal ricevitore GPS con satelliti e permessi (la WebView non dice perché la posizione manca)
        registerPlugin(PosizionePlugin.class);
        super.onCreate(savedInstanceState);
        // schermo sempre acceso finché l'app è in primo piano (pianificazione e volo); Android lo toglie da solo
        // quando l'app va in secondo piano
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
