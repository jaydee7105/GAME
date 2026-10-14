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

## 3. Set up ads (AdMob)

Planet Drop earns money the same way Block Blast does: ads only, no
purchases. See [MONETISATION.md](MONETISATION.md) for the placements and the
pacing rules. Until you add your own ids, every build shows Google's **test
ads**, which are safe to tap but earn nothing.

1. Sign up at <https://admob.google.com> and add your payment details.
2. **Apps > Add app** > Android > "Planet Drop" (you can link it to the Play
   listing once it's live). Copy the **App ID** (`ca-app-pub-XXXX~YYYY`).
3. **Ad units**, create three and copy each id (`ca-app-pub-XXXX/NNNN`):
   - *Banner* (adaptive) for the bottom of the screen during play
   - *Interstitial* for between games
   - *Rewarded* for the "Keep going?" revive (reward: 1 "revive")
4. **Privacy & messaging > GDPR**: create and publish a consent message for
   the app (pick "Consent or manage options"). Also publish a **US state
   regulations** message. The game shows these automatically.
5. Optional but worth it: **Mediation**, add bidding networks (AppLovin,
   Unity, Meta, Mintegral, Pangle...) to raise what each impression pays.
6. Add these repository secrets (same place as the signing key):

   | Secret | Value |
   |---|---|
   | `ADMOB_APP_ID` | App ID, `ca-app-pub-XXXX~YYYY` |
   | `ADMOB_BANNER_ID` | banner unit id |
   | `ADMOB_INTERSTITIAL_ID` | interstitial unit id |
   | `ADMOB_REWARDED_ID` | rewarded unit id |

7. **app-ads.txt**: AdMob shows a line like
   `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`. Put it in a
   file called `app-ads.txt` at the root of the website you list as the
   developer website on Google Play (e.g. `https://yourname.github.io/app-ads.txt`).
   Unverified apps earn noticeably less.

Never tap your own live ads: add your phone as a **test device** in AdMob
(Settings > Test devices) before installing a build with real ids.

## 4. Google Play Console

1. Create a developer account at <https://play.google.com/console> (one-off fee).
2. **Create app**: name "Planet Drop", type Game, Free.
3. **Store listing**: copy the text from `store/listing.md` and upload the
   graphics in `store/`.
4. **App content**:
   - Privacy policy: host `docs/privacy-policy.md` (for example with GitHub
     Pages) and paste the URL. Put the same URL in `PRIVACY_URL` in
     `src/core/social.ts` (the in-game Settings link).
   - Ads: **Yes, my app contains ads**.
   - Advertising ID: **Yes**, used for *Advertising or marketing* (AdMob).
   - Data safety (this covers what the AdMob SDK does):
     - Data collected: **Yes**. Shared: **Yes** (with Google, for advertising).
     - Location > Approximate location; App activity > App interactions;
       App info and performance > Crash logs, Diagnostics; Device or other
       IDs > Device or other IDs.
     - Purposes: Advertising or marketing, Analytics, Fraud prevention.
     - Data is encrypted in transit: **Yes**. Users can request deletion: **No**
       (the game itself stores nothing off the device).
   - Content rating questionnaire: no violence or user content, so expect
     "Everyone" / PEGI 3 (the rating notes that the app contains ads).
   - Target audience: **13 and over** (13-15, 16-17, 18+). Choosing under-13
     age groups puts the app under the Families policy, which needs
     child-directed ad settings and earns far less.
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
the last. The visible version (`1.1.0`) is `versionName` in
`android/app/build.gradle`.

## Play it in a browser

Settings > Pages > Source: **GitHub Actions**. The "Web build" workflow then
publishes a playable version on every push to `main`.
