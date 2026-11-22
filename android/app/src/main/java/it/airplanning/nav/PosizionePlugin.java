// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
package it.airplanning.nav;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.GnssStatus;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Posizione dal ricevitore GPS del tablet, senza passare dalla WebView (dalla 0.23.1).
 * La posizione della WebView non dice perché manca: tablet senza GPS, permesso solo «approssimativo» (Android dà
 * allora una posizione ogni pochi minuti), GPS spento, cielo coperto. Qui si leggono direttamente il ricevitore
 * (LocationManager, una posizione al secondo), i satelliti visti e usati (GnssStatus) e lo stato dei permessi, e
 * l'app può dire al pilota che cosa non va. La posizione dalla rete arriva solo come ripiego, segnata «rete».
 * Codice originale di fringuello79 di Avezzano.
 */
@CapacitorPlugin(name = "Posizione", permissions = {
    @Permission(alias = "precisa", strings = { Manifest.permission.ACCESS_FINE_LOCATION }),
    @Permission(alias = "approssimativa", strings = { Manifest.permission.ACCESS_COARSE_LOCATION })
})
public class PosizionePlugin extends Plugin {
    private LocationManager lm;
    private boolean attivo = false;
    private int visti = 0, usati = 0;
    private long ultimoGpsMs = 0, ultimoReteMs = 0, avvioMs = 0, primoFixMs = 0;
    private int fixGps = 0, fixRete = 0;
    private String errore = "";

    private final LocationListener ascoltoGps = new Ascolto();
    private final LocationListener ascoltoRete = new Ascolto();
    private GnssStatus.Callback satelliti;

    /** Tutti i metodi sono scritti: su Android 10 e precedenti l'interfaccia non ha i metodi predefiniti. */
    private class Ascolto implements LocationListener {
        @Override public void onLocationChanged(Location l) { inviaFix(l); }
        @Override public void onProviderEnabled(String p) { notifyListeners("stato", stato()); }
        @Override public void onProviderDisabled(String p) { notifyListeners("stato", stato()); }
        @Override @SuppressWarnings("deprecation") public void onStatusChanged(String p, int s, Bundle b) { }
    }

    @Override
    public void load() {
        lm = (LocationManager) getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            satelliti = new GnssStatus.Callback() {
                @Override public void onSatelliteStatusChanged(GnssStatus s) {
                    int n = s.getSatelliteCount(), u = 0;
                    for (int i = 0; i < n; i++) if (s.usedInFix(i)) u++;
                    if (n != visti || u != usati) {
                        visti = n; usati = u;
                        JSObject o = new JSObject(); o.put("visti", visti); o.put("usati", usati);
                        notifyListeners("satelliti", o);
                    }
                }
                @Override public void onStopped() { visti = 0; usati = 0; }
            };
        }
    }

    private boolean haGps() { return getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_LOCATION_GPS); }
    private boolean acceso(String p) { try { return lm != null && lm.isProviderEnabled(p); } catch (Exception e) { return false; } }

    private JSObject stato() {
        JSObject o = new JSObject();
        o.put("gpsPresente", haGps());
        o.put("gpsAcceso", acceso(LocationManager.GPS_PROVIDER));
        o.put("reteAccesa", acceso(LocationManager.NETWORK_PROVIDER));
        o.put("precisa", getPermissionState("precisa") == PermissionState.GRANTED);
        o.put("approssimativa", getPermissionState("approssimativa") == PermissionState.GRANTED);
        o.put("attivo", attivo);
        o.put("visti", visti);
        o.put("usati", usati);
        o.put("fixGps", fixGps);
        o.put("fixRete", fixRete);
        long ora = SystemClock.elapsedRealtime();
        o.put("etaGpsS", ultimoGpsMs > 0 ? (ora - ultimoGpsMs) / 1000.0 : -1);
        o.put("etaReteS", ultimoReteMs > 0 ? (ora - ultimoReteMs) / 1000.0 : -1);
        o.put("attesaS", attivo ? (ora - avvioMs) / 1000.0 : 0);
        o.put("primoFixS", primoFixMs > 0 ? (primoFixMs - avvioMs) / 1000.0 : -1);
        o.put("errore", errore);
        o.put("android", Build.VERSION.SDK_INT);
        o.put("modello", Build.MANUFACTURER + " " + Build.MODEL);
        return o;
    }

    private void inviaFix(Location l) {
        boolean gps = LocationManager.GPS_PROVIDER.equals(l.getProvider());
        long ora = SystemClock.elapsedRealtime();
        if (gps) { ultimoGpsMs = ora; fixGps++; if (primoFixMs == 0) primoFixMs = ora; }
        else {
            ultimoReteMs = ora; fixRete++;
            if (ora - ultimoGpsMs < 5000 && ultimoGpsMs > 0) return;   // c'è il GPS: la rete non serve
        }
        JSObject o = new JSObject();
        o.put("lat", l.getLatitude());
        o.put("lon", l.getLongitude());
        o.put("fonte", gps ? "gps" : "rete");
        o.put("tempo", l.getTime());
        if (l.hasAccuracy()) o.put("prec", l.getAccuracy());
        if (l.hasAltitude()) o.put("alt", l.getAltitude());             // sull'ellissoide WGS84, come nella WebView
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && l.hasVerticalAccuracy()) o.put("precAlt", l.getVerticalAccuracyMeters());
        if (l.hasSpeed()) o.put("vel", l.getSpeed());
        if (l.hasBearing()) o.put("rotta", l.getBearing());
        o.put("etaS", (ora - l.getElapsedRealtimeNanos() / 1000000L) / 1000.0);
        o.put("visti", visti);
        o.put("usati", usati);
        notifyListeners("fix", o);
    }

    @PluginMethod
    public void stato(PluginCall call) { call.resolve(stato()); }

    @PluginMethod
    public void avvia(PluginCall call) {
        if (getPermissionState("precisa") != PermissionState.GRANTED && getPermissionState("approssimativa") != PermissionState.GRANTED) {
            requestAllPermissions(call, "dopoPermesso");
            return;
        }
        parti(call);
    }

    @PermissionCallback
    private void dopoPermesso(PluginCall call) {
        if (getPermissionState("precisa") != PermissionState.GRANTED && getPermissionState("approssimativa") != PermissionState.GRANTED) {
            call.reject("permesso negato", "NEGATO");
            return;
        }
        parti(call);
    }

    @SuppressWarnings("MissingPermission")   // i permessi si controllano qui sopra e in stato(); SecurityException gestita
    private void parti(PluginCall call) {
        ferma();
        errore = "";
        visti = 0; usati = 0; fixGps = 0; fixRete = 0; ultimoGpsMs = 0; ultimoReteMs = 0; primoFixMs = 0;
        avvioMs = SystemClock.elapsedRealtime();
        Looper main = Looper.getMainLooper();
        try {
            boolean precisa = getPermissionState("precisa") == PermissionState.GRANTED;
            if (precisa && haGps() && acceso(LocationManager.GPS_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, ascoltoGps, main);
                if (satelliti != null) lm.registerGnssStatusCallback(satelliti, new Handler(main));
            }
            if (acceso(LocationManager.NETWORK_PROVIDER)) lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000L, 0f, ascoltoRete, main);
            attivo = true;
        } catch (SecurityException e) {
            errore = "permesso: " + e.getMessage();
        } catch (Exception e) {
            errore = e.getClass().getSimpleName() + ": " + e.getMessage();
        }
        call.resolve(stato());
    }

    private void ferma() {
        if (lm == null) return;
        try { lm.removeUpdates(ascoltoGps); } catch (Exception e) { /* non registrato */ }
        try { lm.removeUpdates(ascoltoRete); } catch (Exception e) { /* non registrato */ }
        if (satelliti != null) try { lm.unregisterGnssStatusCallback(satelliti); } catch (Exception e) { /* non registrato */ }
        attivo = false;
    }

    @PluginMethod
    public void ferma(PluginCall call) { ferma(); call.resolve(stato()); }

    /** Apre le impostazioni dell'app (per passare a «posizione precisa») o quelle della posizione (GPS spento). */
    @PluginMethod
    public void impostazioni(PluginCall call) {
        String cosa = call.getString("cosa", "app");
        Intent i = "posizione".equals(cosa)
            ? new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
            : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(i); call.resolve(); } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @Override
    protected void handleOnDestroy() { ferma(); }
}
