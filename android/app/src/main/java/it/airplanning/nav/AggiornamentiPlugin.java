// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
package it.airplanning.nav;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * Aggiornamento dell'app: scarica l'APK di una nuova versione, ne controlla l'impronta SHA-256 e lo passa
 * all'installatore di Android, che chiede sempre la conferma del pilota. Android installa l'aggiornamento solo se è
 * firmato con la stessa chiave dell'app già installata, quindi piani, profili e liste salvati restano.
 */
@CapacitorPlugin(name = "Aggiornamenti")
public class AggiornamentiPlugin extends Plugin {

    private File cartella() {
        File dir = new File(getContext().getCacheDir(), "aggiornamenti");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    @PluginMethod
    public void versione(PluginCall call) {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject r = new JSObject();
            r.put("versionName", pi.versionName);
            r.put("versionCode", Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("versione non leggibile: " + e.getMessage());
        }
    }

    @PluginMethod
    public void scarica(PluginCall call) {
        final String url = call.getString("url", "");
        final String atteso = call.getString("sha256", "").toLowerCase(Locale.ROOT);
        final String nome = call.getString("nome", "aggiornamento.apk").replaceAll("[^A-Za-z0-9._-]", "_");
        // solo GitHub su https: l'indirizzo arriva dalla pagina di rilascio, non da altre fonti
        if (!url.startsWith("https://github.com/") && !url.startsWith("https://objects.githubusercontent.com/")
                && !url.startsWith("https://release-assets.githubusercontent.com/")) {
            call.reject("indirizzo di scaricamento non ammesso");
            return;
        }
        new Thread(() -> {
            File out = new File(cartella(), nome);
            try {
                File[] vecchi = cartella().listFiles();
                if (vecchi != null) for (File v : vecchi) v.delete();
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setInstanceFollowRedirects(true);
                c.setConnectTimeout(20000);
                c.setReadTimeout(30000);
                c.setRequestProperty("Accept", "application/octet-stream");
                int code = c.getResponseCode();
                if (code != 200) throw new Exception("risposta " + code);
                long totale = c.getContentLengthLong(), fatti = 0, ultimo = 0;
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(out)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        fo.write(buf, 0, n);
                        md.update(buf, 0, n);
                        fatti += n;
                        if (fatti - ultimo > 1_000_000) {
                            ultimo = fatti;
                            JSObject p = new JSObject();
                            p.put("fatti", fatti);
                            p.put("totale", totale);
                            notifyListeners("avanzamento", p);
                        }
                    }
                }
                StringBuilder hex = new StringBuilder();
                for (byte b : md.digest()) hex.append(String.format("%02x", b));
                if (!atteso.isEmpty() && !atteso.equals(hex.toString())) {
                    out.delete();
                    throw new Exception("impronta SHA-256 diversa da quella pubblicata: file scartato");
                }
                JSObject r = new JSObject();
                r.put("path", out.getAbsolutePath());
                r.put("size", fatti);
                r.put("sha256", hex.toString());
                call.resolve(r);
            } catch (Exception e) {
                out.delete();
                call.reject("scaricamento non riuscito: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void puoInstallare(PluginCall call) {
        JSObject r = new JSObject();
        r.put("ok", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(r);
    }

    @PluginMethod
    public void permesso(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 26) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void installa(PluginCall call) {
        try {
            File f = new File(call.getString("path", ""));
            if (!f.exists() || !f.getCanonicalPath().startsWith(cartella().getCanonicalPath())) {
                call.reject("file dell'aggiornamento non trovato");
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("installazione non avviata: " + e.getMessage());
        }
    }
}
