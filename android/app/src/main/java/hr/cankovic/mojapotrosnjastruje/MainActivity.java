package hr.cankovic.mojapotrosnjastruje;

import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {
    private static final String LATEST_RELEASE_API =
        "https://api.github.com/repos/elviscankovic/moja-potrosnja-struje/releases/latest";
    private static final int INSTALL_PERMISSION_REQUEST = 501;

    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();
    private String pendingApkUrl;
    private String pendingVersion;
    private long updateDownloadId = -1;
    private BroadcastReceiver downloadReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        checkForUpdate();
    }

    private void checkForUpdate() {
        String installedVersion = getInstalledVersion();
        updateExecutor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(LATEST_RELEASE_API).openConnection();
                connection.setConnectTimeout(6000);
                connection.setReadTimeout(6000);
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setRequestProperty("User-Agent", "Moja-potrosnja-struje/" + installedVersion);

                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return;

                StringBuilder response = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                    connection.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) response.append(line);
                }

                JSONObject release = new JSONObject(response.toString());
                String version = release.optString("tag_name", "").replaceFirst("^[vV]", "");
                if (!isNewerVersion(version, installedVersion)) return;

                String apkUrl = findApkUrl(release.optJSONArray("assets"));
                if (apkUrl == null) return;

                runOnUiThread(() -> showUpdateDialog(version, apkUrl));
            } catch (Exception ignored) {
                // Bez interneta aplikacija nastavlja normalno raditi i ne ometa korisnika.
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private String getInstalledVersion() {
        try {
            String version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            return version == null ? "0" : version;
        } catch (Exception ignored) {
            return "0";
        }
    }

    private String findApkUrl(JSONArray assets) {
        if (assets == null) return null;
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.optJSONObject(i);
            if (asset == null) continue;
            String name = asset.optString("name", "");
            String url = asset.optString("browser_download_url", "");
            if (name.toLowerCase().endsWith(".apk") && url.startsWith("https://github.com/")) return url;
        }
        return null;
    }

    static boolean isNewerVersion(String candidate, String current) {
        if (candidate == null || candidate.isBlank()) return false;
        String[] candidateParts = candidate.split("\\.");
        String[] currentParts = current.split("\\.");
        int length = Math.max(candidateParts.length, currentParts.length);
        for (int i = 0; i < length; i++) {
            int next = i < candidateParts.length ? numericPart(candidateParts[i]) : 0;
            int installed = i < currentParts.length ? numericPart(currentParts[i]) : 0;
            if (next != installed) return next > installed;
        }
        return false;
    }

    private static int numericPart(String value) {
        try {
            return Integer.parseInt(value.replaceAll("[^0-9].*$", ""));
        } catch (NumberFormatException exception) {
            return 0;
        }
    }

    private void showUpdateDialog(String version, String apkUrl) {
        if (isFinishing() || isDestroyed()) return;
        new AlertDialog.Builder(this)
            .setTitle("Dostupno je ažuriranje")
            .setMessage("Nova verzija " + version + " spremna je za instalaciju.")
            .setPositiveButton("Ažuriraj", (dialog, which) -> beginUpdate(apkUrl, version))
            .setNegativeButton("Ne sada", null)
            .show();
    }

    private void beginUpdate(String apkUrl, String version) {
        pendingApkUrl = apkUrl;
        pendingVersion = version;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !getPackageManager().canRequestPackageInstalls()) {
            Intent permissionIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getPackageName())
            );
            startActivityForResult(permissionIntent, INSTALL_PERMISSION_REQUEST);
            Toast.makeText(this, "Dopusti instaliranje ažuriranja za ovu aplikaciju.", Toast.LENGTH_LONG).show();
            return;
        }

        downloadUpdate();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == INSTALL_PERMISSION_REQUEST
            && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && getPackageManager().canRequestPackageInstalls()) {
            downloadUpdate();
        }
    }

    private void downloadUpdate() {
        if (pendingApkUrl == null || updateDownloadId != -1) return;

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(pendingApkUrl))
            .setTitle("Moja potrošnja struje " + pendingVersion)
            .setDescription("Preuzimanje ažuriranja")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(
                this,
                Environment.DIRECTORY_DOWNLOADS,
                "Moja_potrosnja_struje-v" + pendingVersion + ".apk"
            );

        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        updateDownloadId = manager.enqueue(request);
        registerDownloadReceiver(manager);
        Toast.makeText(this, "Preuzimanje ažuriranja je pokrenuto.", Toast.LENGTH_SHORT).show();
    }

    private void registerDownloadReceiver(DownloadManager manager) {
        if (downloadReceiver != null) return;
        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (completedId != updateDownloadId) return;

                Uri apkUri = manager.getUriForDownloadedFile(updateDownloadId);
                unregisterDownloadReceiver();
                updateDownloadId = -1;

                if (apkUri == null) {
                    Toast.makeText(MainActivity.this, "Ažuriranje nije bilo moguće preuzeti.", Toast.LENGTH_LONG).show();
                    return;
                }

                Intent installIntent = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(apkUri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(installIntent);
            }
        };

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(downloadReceiver, filter);
        }
    }

    private void unregisterDownloadReceiver() {
        if (downloadReceiver == null) return;
        unregisterReceiver(downloadReceiver);
        downloadReceiver = null;
    }

    @Override
    public void onDestroy() {
        unregisterDownloadReceiver();
        updateExecutor.shutdownNow();
        super.onDestroy();
    }
}
