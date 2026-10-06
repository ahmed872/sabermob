export const auth = {
  en: {
    auth: {
      welcomeBack: 'Welcome back', whoIsWorking: 'Who is working now?', enterPin: 'Enter your PIN', enterPassword: 'Enter your password',
      username: 'Username', password: 'Password', pin: 'PIN', signIn: 'Sign in', usePassword: 'Use password instead', usePin: 'Use PIN',
      otherUser: 'Other user', locked: 'Screen locked', lockedBy: 'Locked — {{name}}', unlock: 'Unlock', switchUser: 'Switch user',
      approvalTitle: 'Manager approval', approvalBody: 'A manager must approve: {{permission}}', approver: 'Manager', approve: 'Approve',
      approvedBy: 'Approved by {{name}}', changePassword: 'Change password', currentPassword: 'Current password', newPassword: 'New password',
      setPin: 'Set PIN', pinHint: '4–8 digits for quick sign-in', removePin: 'Remove PIN', passwordChanged: 'Password changed', pinChanged: 'PIN updated',
      myAccount: 'My account', idleLocked: 'Locked after inactivity'
    },
    onboarding: {
      welcomeTitle: 'Welcome to Central Pro', welcomeBody: 'Let’s set up your shop in a few minutes. Everything works offline — no internet needed.',
      start: 'Get started', stepStore: 'Your store', stepCurrency: 'Currency & tax', stepLanguage: 'Language', stepOwner: 'Owner account',
      stepPrinter: 'Receipt printer', stepCatalog: 'Products', stepDone: 'All set',
      storeName: 'Store name', storeNameHint: 'Printed on receipts and invoices', storePhone: 'Store phone', storeAddress: 'Address', taxNumber: 'Tax registration number',
      currency: 'Currency', enableTax: 'Prices include VAT / sales tax', taxRate: 'Tax rate %', taxHint: 'You can change this later in Settings → Taxes.',
      chooseLanguage: 'Choose the language of the application', ownerTitle: 'Create the owner account', ownerHint: 'The owner can see everything and manage employees.',
      fullName: 'Full name', confirmPassword: 'Confirm password', pinOptional: 'Quick PIN (optional)', passwordsDontMatch: 'Passwords do not match',
      backupPassword: 'Backup password', backupPasswordHint: 'Needed to restore your data on another computer. Write it down and keep it safe.',
      sameAsOwner: 'Use my account password', printerTitle: 'Receipt printer', printerHint: 'Choose your receipt printer now or later from Settings.',
      noPrinters: 'No printers found. You can add one later.', paperSize: 'Paper size', catalogTitle: 'Start with ready categories?',
      starterCatalog: 'Add common categories (cases, chargers, screens…), phone brands and repair services', starterHint: 'Recommended — you can edit or delete them anytime.',
      importLater: 'You can import your product list from Excel later (Inventory → Import).', doneTitle: 'Your shop is ready!',
      doneBody: 'You have a free {{days}}-day trial. Sign in with your owner account to start selling.', finishing: 'Setting up…',
      usernameHint: 'English letters and numbers, e.g. ahmed'
    },
    recovery: {
      link: 'Forgot your password?', title: 'Forgot password',
      staffTitle: 'Are you an employee?', staffBody: 'Ask the store owner: Settings → Users → your name → New password. If you have a PIN, you can also sign in with it.',
      step1: 'Owner: send this recovery code to your vendor (e.g. WhatsApp)', step2: 'Enter the recovery key you receive',
      keyPlaceholder: 'Paste the recovery key here', account: 'Owner account', confirm: 'Confirm password', mismatch: 'The passwords do not match',
      newPin: 'New PIN', submit: 'Set new password', done: 'Password changed. Sign in with the new password.', alsoBackup: 'Use the new password for backups too (recommended)', doneWithBackup: 'Password changed. Backups now use the new password too, and a new backup was made with it. Sign in with the new password.',
      invalid: 'This recovery key is not valid for this computer or was already used. Ask your vendor for a new one with the code above.',
      expired: 'This recovery key has expired (7 days). Ask your vendor for a new one.'
    },
    license: {
      title: 'Activation', trial: 'Free trial', trialDaysLeft: 'Trial: {{count}} days left', trialEnded: 'Your free trial has ended',
      expired: 'Your license has expired', active: 'Activated', lifetime: 'Lifetime license', expiresOn: 'Valid until {{date}}',
      graceWarning: 'License expired — {{count}} grace days remaining. Please renew.', expiringSoon: 'License expires in {{count}} days',
      requiredBody: 'To continue using Central Pro, send the request code below to your vendor and enter the activation key you receive.',
      requestCode: 'Request code', activationKey: 'Activation key', keyPlaceholder: 'Paste the activation key here', activate: 'Activate',
      activated: 'Central Pro is activated. Thank you!', tier: 'Edition', serial: 'License #', clockWarning: 'Your computer clock seems to be wrong. Please correct the date and time.',
      dataSafe: 'Your data is safe. You can still create a backup while the app is not activated.', copyCode: 'Copy code',
      tiers: { TRIAL: 'Trial', BASIC: 'Basic', PROFESSIONAL: 'Professional', ENTERPRISE: 'Enterprise' }, maxUsers: 'Up to {{count}} users',
      activateNow: 'Activate now', manage: 'License & activation',
      subDaysLeft: 'Subscription: {{count}} days left', subGrace: 'Subscription ended — {{count}} grace days left',
      subUntil: 'Subscription active until {{date}} ({{count}} days left)', subExpired: 'Your subscription has ended',
      plan: 'Plan', planSubscription: '{{months}}-month subscription — {{price}} EGP', noUserLimit: 'unlimited users',
      renewNotice: 'Your subscription ends in {{count}} days ({{date}}). Renew {{months}} months for {{price}} EGP: send the request code to your vendor and enter the new key.',
      renewNoticeGrace: 'Your subscription has ended. Central Pro stops in {{count}} days. Renew {{months}} months for {{price}} EGP now.',
      renewHow: 'To renew: send the request code to your vendor. Each new key adds {{months}} months on top of the time you have left.',
      enterRenewalKey: 'Enter renewal key', renewed: 'Subscription renewed until {{date}}', hideToday: 'Hide for today',
      keyUsed: 'This key was already entered on this computer.', keyExpired: 'This key has already expired. Ask your vendor for a new one.'
    }
  },
  ar: {
    auth: {
      welcomeBack: 'أهلاً بعودتك', whoIsWorking: 'مين شغال دلوقتي؟', enterPin: 'أدخل الرقم السري', enterPassword: 'أدخل كلمة المرور',
      username: 'اسم المستخدم', password: 'كلمة المرور', pin: 'الرقم السري', signIn: 'دخول', usePassword: 'الدخول بكلمة المرور', usePin: 'الدخول بالرقم السري',
      otherUser: 'مستخدم آخر', locked: 'الشاشة مقفلة', lockedBy: 'مقفلة — {{name}}', unlock: 'فتح', switchUser: 'تبديل المستخدم',
      approvalTitle: 'موافقة المدير', approvalBody: 'هذا الإجراء يحتاج موافقة: {{permission}}', approver: 'المدير', approve: 'موافقة',
      approvedBy: 'تمت الموافقة بواسطة {{name}}', changePassword: 'تغيير كلمة المرور', currentPassword: 'كلمة المرور الحالية', newPassword: 'كلمة المرور الجديدة',
      setPin: 'تعيين رقم سري', pinHint: 'من 4 إلى 8 أرقام للدخول السريع', removePin: 'إزالة الرقم السري', passwordChanged: 'تم تغيير كلمة المرور', pinChanged: 'تم تحديث الرقم السري',
      myAccount: 'حسابي', idleLocked: 'تم القفل لعدم النشاط'
    },
    onboarding: {
      welcomeTitle: 'أهلاً بك في سنترال برو', welcomeBody: 'هنجهز محلك في دقائق. البرنامج يعمل بالكامل بدون إنترنت.',
      start: 'ابدأ', stepStore: 'بيانات المحل', stepCurrency: 'العملة والضريبة', stepLanguage: 'اللغة', stepOwner: 'حساب المالك',
      stepPrinter: 'طابعة الإيصالات', stepCatalog: 'الأصناف', stepDone: 'تم',
      storeName: 'اسم المحل', storeNameHint: 'يظهر على الإيصالات والفواتير', storePhone: 'تليفون المحل', storeAddress: 'العنوان', taxNumber: 'رقم التسجيل الضريبي',
      currency: 'العملة', enableTax: 'الأسعار تشمل ضريبة القيمة المضافة', taxRate: 'نسبة الضريبة %', taxHint: 'يمكنك تغيير ذلك لاحقاً من الإعدادات ← الضرائب.',
      chooseLanguage: 'اختر لغة البرنامج', ownerTitle: 'إنشاء حساب المالك', ownerHint: 'المالك يرى كل شيء ويدير الموظفين.',
      fullName: 'الاسم بالكامل', confirmPassword: 'تأكيد كلمة المرور', pinOptional: 'رقم سري سريع (اختياري)', passwordsDontMatch: 'كلمتا المرور غير متطابقتين',
      backupPassword: 'كلمة مرور النسخ الاحتياطي', backupPasswordHint: 'مطلوبة لاسترجاع بياناتك على جهاز آخر. اكتبها واحتفظ بها في مكان آمن.',
      sameAsOwner: 'استخدام كلمة مرور حسابي', printerTitle: 'طابعة الإيصالات', printerHint: 'اختر طابعة الإيصالات الآن أو لاحقاً من الإعدادات.',
      noPrinters: 'لا توجد طابعات. يمكنك إضافتها لاحقاً.', paperSize: 'مقاس الورق', catalogTitle: 'تبدأ بأقسام جاهزة؟',
      starterCatalog: 'إضافة الأقسام الشائعة (جرابات، شواحن، اسكرينات…) وماركات الموبايلات وخدمات الصيانة', starterHint: 'مُستحسن — يمكنك تعديلها أو حذفها في أي وقت.',
      importLater: 'يمكنك استيراد قائمة أصنافك من Excel لاحقاً (المخزن ← استيراد).', doneTitle: 'محلك جاهز!',
      doneBody: 'لديك فترة تجربة مجانية {{days}} يوم. سجّل الدخول بحساب المالك وابدأ البيع.', finishing: 'جاري التجهيز…',
      usernameHint: 'حروف وأرقام إنجليزية، مثال: ahmed'
    },
    recovery: {
      link: 'نسيت كلمة المرور؟', title: 'نسيت كلمة المرور',
      staffTitle: 'إنت موظف؟', staffBody: 'اطلب من صاحب المحل: الإعدادات ← المستخدمين ← اسمك ← كلمة مرور جديدة. ولو ليك رقم سري (PIN) تقدر تدخل بيه.',
      step1: 'لصاحب المحل: ابعت كود الاستعادة ده للمورد (واتساب مثلاً)', step2: 'دخّل مفتاح الاستعادة اللي هيوصلك',
      keyPlaceholder: 'الصق مفتاح الاستعادة هنا', account: 'حساب صاحب المحل', confirm: 'تأكيد كلمة المرور', mismatch: 'كلمتين المرور مش زي بعض',
      newPin: 'رقم سري جديد', submit: 'تغيير كلمة المرور', done: 'تم تغيير كلمة المرور. ادخل بالكلمة الجديدة.', alsoBackup: 'استخدم الكلمة الجديدة للنسخ الاحتياطي كمان (مستحسن)', doneWithBackup: 'تم تغيير كلمة المرور، والنسخ الاحتياطي بقى بالكلمة الجديدة واتعملت نسخة جديدة بيها. ادخل بالكلمة الجديدة.',
      invalid: 'مفتاح الاستعادة ده مش صالح للجهاز ده أو اتستخدم قبل كده. اطلب مفتاح جديد من المورد بالكود اللي فوق.',
      expired: 'مفتاح الاستعادة ده انتهت صلاحيته (7 أيام). اطلب مفتاح جديد من المورد.'
    },
    license: {
      title: 'التفعيل', trial: 'فترة تجريبية', trialDaysLeft: 'الفترة التجريبية: باقي {{count}} يوم', trialEnded: 'انتهت الفترة التجريبية المجانية',
      expired: 'انتهت صلاحية الترخيص', active: 'مُفعّل', lifetime: 'ترخيص مدى الحياة', expiresOn: 'صالح حتى {{date}}',
      graceWarning: 'انتهى الترخيص — متبقي {{count}} يوم سماح. برجاء التجديد.', expiringSoon: 'الترخيص ينتهي خلال {{count}} يوم',
      requiredBody: 'لمتابعة استخدام سنترال برو، أرسل كود الطلب التالي للموزع، ثم أدخل مفتاح التفعيل الذي ستحصل عليه.',
      requestCode: 'كود الطلب', activationKey: 'مفتاح التفعيل', keyPlaceholder: 'الصق مفتاح التفعيل هنا', activate: 'تفعيل',
      activated: 'تم تفعيل سنترال برو. شكراً لك!', tier: 'الإصدار', serial: 'رقم الترخيص', clockWarning: 'يبدو أن ساعة الجهاز غير مضبوطة. برجاء تصحيح التاريخ والوقت.',
      dataSafe: 'بياناتك آمنة. يمكنك عمل نسخة احتياطية حتى قبل التفعيل.', copyCode: 'نسخ الكود',
      tiers: { TRIAL: 'تجريبي', BASIC: 'أساسي', PROFESSIONAL: 'احترافي', ENTERPRISE: 'مؤسسات' }, maxUsers: 'حتى {{count}} مستخدم',
      activateNow: 'فعّل الآن', manage: 'الترخيص والتفعيل',
      subDaysLeft: 'الاشتراك: باقي {{count}} يوم', subGrace: 'الاشتراك خلص — باقي {{count}} يوم سماح',
      subUntil: 'الاشتراك ساري حتى {{date}} (باقي {{count}} يوم)', subExpired: 'انتهى الاشتراك',
      plan: 'الباقة', planSubscription: 'اشتراك {{months}} شهور — {{price}} جنيه', noUserLimit: 'بدون حد للمستخدمين',
      renewNotice: 'اشتراكك هيخلص بعد {{count}} يوم ({{date}}). للتجديد {{months}} شهور بـ {{price}} جنيه: ابعت كود الطلب للمورد وادخل المفتاح الجديد.',
      renewNoticeGrace: 'اشتراكك خلص، والبرنامج هيقف بعد {{count}} يوم. جدّد دلوقتي {{months}} شهور بـ {{price}} جنيه.',
      renewHow: 'التجديد: ابعت كود الطلب للمورد. كل مفتاح جديد بيضيف {{months}} شهور على الأيام الباقية من اشتراكك.',
      enterRenewalKey: 'إدخال مفتاح التجديد', renewed: 'تم تجديد الاشتراك حتى {{date}}', hideToday: 'إخفاء النهارده',
      keyUsed: 'المفتاح ده اتدخل قبل كده على الجهاز ده.', keyExpired: 'المفتاح ده انتهت صلاحيته. اطلب مفتاح جديد من المورد.'
    }
  }
}
