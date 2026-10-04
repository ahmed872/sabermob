# دليل التفعيل للمورد — Vendor licensing guide

> هذا الدليل لك أنت (صاحب البرنامج / المورد)، وليس للعميل.
> English version below.

## الباقة

**باقة واحدة: اشتراك 3 شهور (90 يوم) بـ 500 جنيه** — كل المميزات، من غير حد لعدد المستخدمين.
السعر والمدة متعرّفين في `src/shared/subscription.ts` (البرنامج بيعرضهم للعميل في شريط التجديد).

- الأيام الباقية ظاهرة للعميل دايماً فوق؛ أصفر في آخر 10 أيام، أحمر في آخر 3.
- في آخر 7 أيام شريط فوق كل الشاشات: السعر + كود الطلب + زر «إدخال مفتاح التجديد».
- بعد النهاية 3 أيام سماح، وبعدها شاشة التفعيل (البيانات عمرها ما بتتمسح).
- **كل مفتاح بيتضاف على الأيام الباقية**: العميل اللي يجدد بدري مش بيخسر ولا يوم. لو اشتراكه خلص، المفتاح بيبدأ من يوم إصداره.
- كل مفتاح بيتدخل **مرة واحدة** على **جهاز واحد**. عايز يدفع 6 شهور؟ اعمل له مفتاحين.

## الفكرة باختصار

1. العميل يثبت البرنامج ويشتغل **15 يوم تجربة** بكل المميزات.
2. لما التجربة تخلص، البرنامج يعرض شاشة التفعيل بدل الشغل (البيانات عمرها ما بتضيع، والعميل يقدر يعمل نسخة احتياطية من نفس الشاشة).
3. البرنامج يعرض للعميل **كود طلب** من 16 حرف مثل: `7K3Q-9XWM-2PDA-HF6R`.
4. العميل يبعتلك الكود (واتساب مثلاً). أنت تعمل **مفتاح تفعيل** خاص بالجهاز ده بس وتبعته له.
5. العميل يلصق المفتاح في شاشة التفعيل ← البرنامج يشتغل فوراً، **من غير إنترنت**.

المفتاح موقّع رقمياً بمفتاحك الخاص (Ed25519)، ومربوط بجهاز العميل؛ ميشتغلش على جهاز تاني ومحدش يقدر يزوّره.

## الطريقة الأسهل: من GitHub (من الموبايل كمان)

1. **مرة واحدة:** ضيف Secret باسم `LICENSE_PRIVATE_KEY` في
   **Settings ← Secrets and variables ← Actions ← New repository secret**.
   القيمة ممكن تكون **جملة سرية طويلة من اختيارك** (20 حرف أو أكتر، عشوائية، متتكتبش في أي مكان تاني)
   أو ملف مفتاح PEM. البرنامج بيحوّلها لمفتاح توقيع ثابت.
   - **بناء نسخة ويندوز** بيربط المفتاح ده بالبرنامج أوتوماتيك في كل إصدار.
   - احتفظ بالجملة السرية في مكان آمن (ورقة في خزنة / مدير كلمات مرور). لو ضاعت مش هتقدر تطلع مفاتيح للنسخ المتباعة.
2. كل ما عميل يدفع الـ 500 جنيه ويبعتلك كود الطلب: **Actions ← توليد مفتاح تفعيل ← Run workflow**
   - الصق **كود الطلب** (واكتب اسم العميل لو حابب)، واضغط **Run workflow**. المفتاح دايماً اشتراك 3 شهور.
   - كود الطلب ثابت لنفس الجهاز، فالعميل بيبعت نفس الكود في كل تجديد.
3. بعد حوالي 10 ثواني افتح التشغيل ← هتلاقي **مفتاح التفعيل** في الملخص، جاهز تنسخه وتبعته.

الأداة بترفض تطلع مفتاح لو المفتاح السري مش مطابق للمفتاح المبني جوه البرنامج (عشان متبعتش مفتاح مش هيشتغل).

> ⚠️ **المستودع لازم يكون خاص (Private).** في مستودع عام أي حد يقدر يشوف الكود ويبني نسخة بمفتاحه هو ويتخطى التفعيل،
> ويشوف سجل التشغيلات (أكواد الطلب وأي اسم عميل تكتبه). المفاتيح نفسها مربوطة بجهاز واحد فمش خطر لو اتشافت.
> من **Settings ← General ← Danger Zone ← Change visibility ← Private**.

## الطريقة اليدوية (على جهازك)

### أول مرة فقط: إنشاء مفتاحك الخاص

> ✅ **مفتاحك (الـ Secret) مربوط بالبرنامج بالفعل** من الإصدار 1.0.1 (`src/main/license/public-key.ts`).
> **متغيرش الـ Secret ومتشغلش `license:init`** إلا لو اتسرق — أي مفتاح جديد بيخلي المفاتيح القديمة متشتغلش في النسخ الجديدة.

على جهازك أنت (جهاز آمن، مش جهاز عميل):

```bash
npm install
npm run license:init
```

ده بيعمل:
- `license-keys/private-key.pem` ← **المفتاح السري. أهم ملف عندك.**
- يحدّث `src/main/license/public-key.ts` بالمفتاح العام اللي هيتبني جوه البرنامج.

بعدها لازم تبني نسخة جديدة من البرنامج (`npm run dist:win`) — دي النسخة اللي توزعها.
أمر البناء بيرفض يكمل لو البرنامج لسه بيستخدم مفتاح التطوير (حماية من الغلط).

### ⚠️ احمِ المفتاح السري
- اعمل نسخة من مجلد `license-keys/` على فلاشة + مكان آمن تاني (مشفّر).
- **لو ضاع:** مش هتقدر تفعّل أي نسخة متباعة بالبرنامج الحالي، ولازم توزع نسخة جديدة بمفتاح جديد.
- **لو اتسرق:** أي حد يقدر يعمل مفاتيح. اعمل `license:init` جديد ووزّع نسخة جديدة.
- المجلد ده متجاهَل في Git (`.gitignore`) — متشيلوش من التجاهل أبداً.

### إصدار مفتاح لعميل

```bash
npm run license:issue -- --request 7K3Q-9XWM-2PDA-HF6R --plan quarterly --customer "سنترال الأمل - المعادي"
```

`--plan quarterly` = الباقة (3 شهور، كل المميزات). الخيارات اللي تحت للحالات الخاصة بس (مثلاً ترخيص مدى الحياة).

خيارات:

| الخيار | المعنى | الافتراضي |
| --- | --- | --- |
| `--request` | كود الطلب من شاشة العميل (مطلوب) | — |
| `--tier` | `BASIC` (حتى 3 مستخدمين) / `PROFESSIONAL` (حتى 15) / `ENTERPRISE` (بدون حد عملي) | `PROFESSIONAL` |
| `--days` | مدة الترخيص بالأيام. `0` = مدى الحياة. `365` = سنة من النهارده | `0` |
| `--customer` | اسم العميل (للسجل عندك فقط) | — |

الأمر بيطبع المفتاح (نص طويل)، انسخه وابعته للعميل كما هو.
كل مفتاح بيتسجل في `license-keys/issued-keys.csv` (التاريخ، العميل، الكود، النوع، المدة، الرقم التسلسلي).

```bash
npm run license:list                                  # كل المفاتيح اللي أصدرتها
npm run license:verify -- --request XXXX-XXXX-XXXX-XXXX --key "<المفتاح>"   # تتأكد من مفتاح
```

## أسئلة متكررة

- **العميل غلط في تاريخ الجهاز وخلاه سنة قدام وبعدين صلّحه؟** البرنامج بيحتفظ بآخر وقت شافه، فالتجربة أو الترخيص المؤقت ممكن يخلص بدري. الترخيص **مدى الحياة مش بيتأثر**. الحل: مفتاح جديد لنفس كود الطلب — البيانات سليمة.

- **العميل غيّر الجهاز أو الويندوز؟** كود الطلب هيتغير. اعمل له مفتاح جديد للكود الجديد. بياناته بتتنقل بملف النقل (`.centralbundle`) أو نسخة احتياطية.
- **ترخيص سنوي خلص؟** البرنامج بيدي 3 أيام سماح ثم يعرض شاشة التفعيل. اعمل مفتاح جديد بنفس كود الطلب.
- **حد رجّع تاريخ الجهاز لورا عشان يطوّل التجربة؟** مش هيستفيد: البرنامج بيحتفظ بآخر وقت شافه (مختوم ضد التعديل) وبيحسب منه.
- **العميل مسح البرنامج ونزّله تاني؟** فترة التجربة مش بتبدأ من الأول (فيه علامة محفوظة في الويندوز).

---

## English

**Flow:** 15-day full trial → app shows a 16-character *request code* bound to that PC →
you run `license:issue` with it → send the activation key → customer pastes it; works offline.
Keys are Ed25519-signed (16-byte payload: version, tier, machine id, issue day, validity, serial),
bound to one machine, impossible to forge without your private key.

**Once:** `npm run license:init` creates `license-keys/private-key.pem` and writes the public key
into `src/main/license/public-key.ts`. Rebuild and distribute that build. `npm run dist:win`
refuses to build while the development key is still embedded (`scripts/release-check.mjs`).

**Keep `license-keys/` safe and backed up offline.** Lost → you cannot license copies already sold.
Leaked → anyone can mint keys; rotate with a new `license:init` and ship a new build.

**From GitHub Actions:** store the private key PEM as repository secret `LICENSE_PRIVATE_KEY`, then
*Actions → توليد مفتاح تفعيل → Run workflow* (request code, tier, duration). The key appears in the run
summary. Keep the repository **private**: a public repo exposes the source (anyone can build an
unlicensed copy with their own key) and the run history.

**Clock set forward by mistake:** the app keeps the latest time it has seen, so a trial or timed license
can end early; lifetime licenses are unaffected; issue a new key — data is untouched.

**Issue locally:** `npm run license:issue -- --request XXXX-XXXX-XXXX-XXXX [--tier BASIC|PROFESSIONAL|ENTERPRISE] [--days 0|365] [--customer "Name"]`.
User limits: BASIC 3, PROFESSIONAL 15, ENTERPRISE 1000 (trial 10).
Timed licenses get a 3-day grace period. Every key is logged in `license-keys/issued-keys.csv`.

**Anti-tamper:** trial start and last-seen time are HMAC-sealed and mirrored outside the data
folder (Windows registry `HKCU\Software\CentralPro`); the app always uses the latest time it has
seen, so turning the clock back gains nothing; reinstalling does not restart the trial. Data is never
deleted: an expired copy shows the activation screen, where backups remain available.
