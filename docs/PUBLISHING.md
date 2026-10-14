# Publishing Planet Drop on Google Play

The game builds automatically on GitHub Actions ("Android build" workflow).
Every push runs the smoke test, then produces an artifact `planet-drop-android`:

- `app-release.aab`: the App Bundle you upload to Google Play
- `app-release.apk`: an installable build for testing on your own phone

Download it from the repository's **Actions** tab > latest "Android build" run > Artifacts.

## 1. Create your upload key (once, keep it safe)

```bash
keytool -genkeypair -v -keystore planet-drop-upload.jks -alias planetdrop \
  -keyalg RSA -keysize 2048 -validity 10000
```

Back up the `.jks` file and its password somewhere safe, and never commit it.
With Play App Signing, Google holds the real signing key. This is only your
upload key, and Google can reset it if it's ever lost.

## 2. Give the key to GitHub Actions

Repository > Settings > Secrets and variables > Actions > New repository secret:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | output of `base64 -w0 planet-drop-upload.jks` |
| `ANDROID_KEYSTORE_ALIAS` | `planetdrop` (the alias you chose) |
| `ANDROID_KEYSTORE_PASSWORD` | your keystore / key password |

Re-run the workflow (Actions > Android build > Run workflow). Builds made
without these secrets use a throwaway key: they install fine for testing but
**cannot** be uploaded to Google Play.

## 3. Google Play Console

1. Create a developer account at <https://play.google.com/console> (one-off fee).
2. **Create app**: name "Planet Drop", type Game, Free.
3. **Store listing**: copy the text from `store/listing.md` and upload the
   graphics in `store/`.
4. **App content**:
   - Privacy policy: host `docs/privacy-policy.md` (for example with GitHub
     Pages) and paste the URL.
   - Ads: *No*. Data safety: *No data collected or shared*.
   - Content rating questionnaire: no violence or user content, so expect "Everyone" / PEGI 3.
   - Target audience: choose your age groups.
5. **Testing > Closed testing**: upload `app-release.aab`.
   New *personal* developer accounts must run a closed test with at least
   **12 testers for 14 days in a row** before they can publish to production.
   Organisation accounts skip this step.
6. After the test period, **Production > Create release**, upload the newest
   `.aab`, and submit for review (usually a few hours to a few days).

The package name is `com.jaydee7105.planetdrop` (in `capacitor.config.ts` and
`android/app/build.gradle`). It is permanent once uploaded, so change it first
if you want a different one.

## Version numbers

CI sets the version code to `run number + 100`, so every build is higher than
the last. The visible version (`1.0.0`) is `versionName` in
`android/app/build.gradle`.

## Play it in a browser

Settings > Pages > Source: **GitHub Actions**. The "Web build" workflow then
publishes a playable version on every push to `main`.
