// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
package it.airplanning.nav;

import android.media.AudioAttributes;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Avvisi a voce con la sintesi vocale di Android. La WebView di Android non offre la sintesi vocale del web
 * (speechSynthesis): fino alla 0.21.0 gli avvisi a voce nell'app non si sentivano (collaudo 0.21.0, A4).
 * Un avviso grave interrompe quelli in corso («subito» = svuota la coda). Funziona senza rete se la voce italiana
 * è installata sul tablet (Impostazioni → Sintesi vocale). Codice originale di fringuello79 di Avezzano.
 */
@CapacitorPlugin(name = "Voce")
public class VocePlugin extends Plugin {
    private TextToSpeech tts;
    private boolean pronta = false;
    private String stato = "avvio";
    private final List<String[]> attesa = new ArrayList<>();

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), codice -> {
            if (codice != TextToSpeech.SUCCESS) { stato = "sintesi vocale non disponibile"; return; }
            int r = tts.setLanguage(Locale.ITALIAN);
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                stato = "voce italiana non installata";
                tts.setLanguage(Locale.getDefault());
            } else stato = "pronta";
            tts.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            pronta = true;
            synchronized (attesa) {
                for (String[] a : attesa) pronuncia(a[0], "1".equals(a[1]));
                attesa.clear();
            }
        });
    }

    private void pronuncia(String testo, boolean subito) {
        Bundle p = new Bundle();
        p.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
        tts.speak(testo, subito ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, p, "aeria-" + System.nanoTime());
    }

    @PluginMethod
    public void parla(PluginCall call) {
        String testo = call.getString("testo", "");
        boolean subito = Boolean.TRUE.equals(call.getBoolean("subito", false));
        if (testo == null || testo.isEmpty()) { call.resolve(); return; }
        if (!pronta) synchronized (attesa) { attesa.add(new String[] { testo, subito ? "1" : "0" }); }
        else pronuncia(testo, subito);
        call.resolve();
    }

    @PluginMethod
    public void zitto(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }

    @PluginMethod
    public void stato(PluginCall call) {
        JSObject r = new JSObject();
        r.put("pronta", pronta);
        r.put("stato", stato);
        call.resolve(r);
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
    }
}
