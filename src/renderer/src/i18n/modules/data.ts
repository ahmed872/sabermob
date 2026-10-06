export const data = {
  en: {
    reset: {
      title: 'Start fresh', open: 'Start fresh…',
      body: 'Removes sales, products, customers, suppliers, purchases, repairs, shifts and offers — for example after a trial period. Store details, users, settings and activation stay.',
      willDelete: 'Will be removed:', counts: '{{sales}} sales · {{products}} products · {{customers}} customers · {{suppliers}} suppliers · {{repairs}} repairs, with purchases, shifts, stock history and offers.',
      willKeep: 'Will stay:', keepList: 'Store details, users and roles, settings, activation, categories and brands, ready-made services.',
      clearCatalog: 'Also remove categories, brands, phone models and services',
      backupNote: 'A safety backup is made first (listed as “Before starting fresh”): restore it to undo. The app restarts afterwards.',
      password: 'Your password', typeWord: 'Type “{{word}}” to confirm', word: 'DELETE', confirm: 'Delete and start fresh'
    },
    update: {
      title: 'Updates', current: 'Installed version {{version}}', check: 'Check for updates', checking: 'Checking…', none: 'You have the latest version',
      available: 'Version {{version}} is available', download: 'Download', downloading: 'Downloading… {{progress}}%', ready: 'Version {{version}} is ready to install',
      install: 'Back up & install now', installHint: 'A backup is made first. The app closes, updates and opens again. Your data is kept.',
      offline: 'Could not reach the update server. Check the internet connection and try again.',
      manual: 'Updates come as a new installer from your vendor. Run it on this computer: your data, settings and license are kept.'
    },
    backup: {
      last: 'Last backup', never: 'No backup yet', next: 'Next automatic backup', now: 'Back up now', creating: 'Backing up…', created: 'Backup saved and encrypted',
      restoreFile: 'Restore from a file…', openFolder: 'Open backup folder', protectedOs: 'Encrypted · key protected by this Windows account', protectedPlain: 'Encrypted with your backup password',
      notConfigured: 'Set a backup password to start protecting your data', notConfiguredBody: 'Backups are always encrypted. You will need this password to restore your data on another computer.',
      locked: 'Automatic backups are paused on this computer', lockedBody: 'Enter the backup password once to resume them.', unlock: 'Resume backups', unlocked: 'Automatic backups resumed',
      password: 'Backup password', newPassword: 'New backup password', confirm: 'Confirm password', mismatch: 'Passwords do not match', setPassword: 'Save password', passwordSaved: 'Backup password saved. A new backup was made with it (older backups keep their old password).',
      changePassword: 'Change backup password', changeHint: 'Older backups keep the password they were made with.', currentPassword: 'Current backup password',
      folders: 'Where backups are saved', folder: 'Backup folder', mirror: 'Extra copy (USB / external drive)', mirrorHint: 'Each backup is also copied here. Recommended: a USB stick or another disk.', none: 'Not set',
      change: 'Change', choose: 'Choose', reset: 'Use default', remove: 'Remove',
      history: 'Backups', verify: 'Check', verified: 'Backup is healthy: {{products}} products, {{sales}} sales', restore: 'Restore', missing: 'File missing', failed: 'Failed',
      kinds: { AUTO: 'Automatic', MANUAL: 'Manual', PRE_RESTORE: 'Before restore', PRE_UPDATE: 'Before update', PRE_RESET: 'Before starting fresh', BUNDLE: 'Transfer bundle' },
      move: 'Move to another computer', moveBody: 'Save the whole shop (data, photos and settings) in one encrypted file. On the new computer choose “Restore from backup” on the first screen.',
      exportBundle: 'Save transfer file', bundleSaved: 'Transfer file saved: {{path}}',
      restoreTitle: 'Restore backup', restoreWarn: 'All current data on this computer will be replaced by this backup.', restoreSafety: 'A safety copy of the current data is saved first, so this can be undone.',
      restoreUnderstand: 'I understand that current data will be replaced', restoreNow: 'Restore now', restoring: 'Restoring… the app will restart', newer: 'This backup was made by a newer version of Central Pro. Update the app first.',
      shop: 'Shop', createdAt: 'Made on', version: 'Version', contents: 'Contains', counts: '{{products}} products · {{customers}} customers · {{sales}} sales · {{repairs}} repairs',
      fromBackup: 'Restore from backup', fromBackupHint: 'Moving from another computer? Restore your shop from a backup or transfer file.'
    },
    importer: {
      title: 'Import from Excel / CSV', products: 'Import products', customers: 'Import customers', button: 'Import',
      steps: { file: 'File', columns: 'Columns', check: 'Check', done: 'Done' },
      chooseFile: 'Choose a file', dropHint: 'Excel (.xlsx) or CSV. The first row must contain the column names.', template: 'Download a ready template',
      rows: '{{count}} rows', column: 'Column in your file', notImported: '— not imported —', required: 'required', sample: 'First rows of your file',
      fields: {
        name: 'Name', sellPrice: 'Selling price', costPrice: 'Cost', stock: 'Quantity', barcode: 'Barcode', sku: 'SKU', category: 'Category', brand: 'Brand', minStock: 'Alert level', minPrice: 'Minimum price',
        phone: 'Mobile', phone2: 'Second phone', address: 'Address', notes: 'Notes', balance: 'Balance (owes us)'
      },
      ready: '{{count}} rows ready to import', existing: '{{count}} already exist', problems: '{{count}} rows have problems and will be skipped',
      existingMode: 'Rows that already exist', skip: 'Skip them', update: 'Update them', updateHintProducts: 'Updates prices only. Stock is never changed by an import.', updateHintCustomers: 'Updates contact details only. Balances are never changed.',
      row: 'Row', field: 'Column', problem: 'Problem', value: 'Value',
      codes: { REQUIRED: 'Missing', INVALID_NUMBER: 'Not a valid number', INVALID_BARCODE: 'Invalid barcode', DUPLICATE_IN_FILE: 'Repeated in the file', EXISTS: 'Already exists', ERROR: 'Could not be saved' },
      run: 'Import {{count}} rows', running: 'Importing… you can keep selling meanwhile', next: 'Check data',
      result: 'Import finished', created: 'Added', updated: 'Updated', skipped: 'Skipped', failed: 'Failed', failedReport: 'Download problems report', problemsTitle: 'Import problems'
    }
  },
  ar: {
    reset: {
      title: 'البدء من جديد', open: 'البدء من جديد…',
      body: 'بيمسح المبيعات والأصناف والعملاء والموردين والمشتريات والصيانة والورديات والعروض — مثلاً بعد فترة تجربة. بيانات المحل والمستخدمين والإعدادات والتفعيل بيفضلوا زي ما هم.',
      willDelete: 'هيتمسح:', counts: '{{sales}} فاتورة · {{products}} صنف · {{customers}} عميل · {{suppliers}} مورد · {{repairs}} صيانة، ومعاهم المشتريات والورديات وحركة المخزون والعروض.',
      willKeep: 'هيفضل:', keepList: 'بيانات المحل، المستخدمين والصلاحيات، الإعدادات، التفعيل، الأقسام والماركات، الخدمات الجاهزة.',
      clearCatalog: 'امسح كمان الأقسام والماركات والموديلات والخدمات',
      backupNote: 'هتتعمل نسخة أمان الأول (باسم «قبل البدء من جديد») — لو غيرت رأيك استرجعها. البرنامج هيقفل ويفتح تاني بعد المسح.',
      password: 'كلمة المرور بتاعتك', typeWord: 'اكتب «{{word}}» للتأكيد', word: 'امسح', confirm: 'امسح وابدأ من جديد'
    },
    update: {
      title: 'التحديثات', current: 'الإصدار الحالي {{version}}', check: 'البحث عن تحديث', checking: 'جاري البحث…', none: 'عندك أحدث إصدار',
      available: 'الإصدار {{version}} متاح', download: 'تحميل', downloading: 'جاري التحميل… {{progress}}%', ready: 'الإصدار {{version}} جاهز للتثبيت',
      install: 'نسخة احتياطية ثم تثبيت', installHint: 'هيتعمل نسخة احتياطية الأول. البرنامج هيقفل ويتحدث ويفتح تاني. بياناتك محفوظة.',
      offline: 'تعذر الوصول لسيرفر التحديثات. تأكد من الإنترنت وحاول تاني.',
      manual: 'التحديثات بتوصلك كملف تثبيت جديد من المورد. شغله على الجهاز ده: بياناتك وإعداداتك والترخيص بيفضلوا زي ما هم.'
    },
    backup: {
      last: 'آخر نسخة احتياطية', never: 'لا توجد نسخة احتياطية بعد', next: 'النسخة التلقائية القادمة', now: 'نسخة احتياطية الآن', creating: 'جاري النسخ…', created: 'تم حفظ النسخة الاحتياطية مشفرة',
      restoreFile: 'استرجاع من ملف…', openFolder: 'فتح مجلد النسخ', protectedOs: 'مشفرة · المفتاح محمي بحساب ويندوز ده', protectedPlain: 'مشفرة بكلمة مرور النسخ الاحتياطي',
      notConfigured: 'حدد كلمة مرور للنسخ الاحتياطي عشان نبدأ نحمي بياناتك', notConfiguredBody: 'النسخ الاحتياطية دايماً مشفرة. هتحتاج كلمة المرور دي عشان تسترجع بياناتك على جهاز تاني.',
      locked: 'النسخ التلقائي متوقف على الجهاز ده', lockedBody: 'اكتب كلمة مرور النسخ الاحتياطي مرة واحدة عشان يرجع يشتغل.', unlock: 'تشغيل النسخ', unlocked: 'رجع النسخ التلقائي يشتغل',
      password: 'كلمة مرور النسخ الاحتياطي', newPassword: 'كلمة المرور الجديدة', confirm: 'تأكيد كلمة المرور', mismatch: 'كلمتا المرور غير متطابقتين', setPassword: 'حفظ كلمة المرور', passwordSaved: 'تم حفظ كلمة مرور النسخ الاحتياطي، واتعملت نسخة جديدة بيها (النسخ القديمة بتفضل بالكلمة القديمة).',
      changePassword: 'تغيير كلمة مرور النسخ الاحتياطي', changeHint: 'النسخ القديمة تفضل بكلمة المرور اللي اتعملت بيها.', currentPassword: 'كلمة المرور الحالية',
      folders: 'مكان حفظ النسخ', folder: 'مجلد النسخ الاحتياطي', mirror: 'نسخة إضافية (فلاشة / هارد خارجي)', mirrorHint: 'كل نسخة بتتنسخ هنا كمان. يفضل فلاشة أو هارد تاني.', none: 'غير محدد',
      change: 'تغيير', choose: 'اختيار', reset: 'الافتراضي', remove: 'إزالة',
      history: 'النسخ الاحتياطية', verify: 'فحص', verified: 'النسخة سليمة: {{products}} صنف، {{sales}} عملية بيع', restore: 'استرجاع', missing: 'الملف مش موجود', failed: 'فشلت',
      kinds: { AUTO: 'تلقائية', MANUAL: 'يدوية', PRE_RESTORE: 'قبل الاسترجاع', PRE_UPDATE: 'قبل التحديث', PRE_RESET: 'قبل البدء من جديد', BUNDLE: 'ملف نقل' },
      move: 'النقل لجهاز تاني', moveBody: 'احفظ المحل كله (البيانات والصور والإعدادات) في ملف واحد مشفر. على الجهاز الجديد اختار «استرجاع من نسخة احتياطية» في أول شاشة.',
      exportBundle: 'حفظ ملف النقل', bundleSaved: 'تم حفظ ملف النقل: {{path}}',
      restoreTitle: 'استرجاع نسخة احتياطية', restoreWarn: 'كل البيانات الحالية على الجهاز ده هتتبدل بالنسخة دي.', restoreSafety: 'هيتعمل نسخة أمان من البيانات الحالية الأول، فتقدر ترجع فيها.',
      restoreUnderstand: 'فاهم إن البيانات الحالية هتتبدل', restoreNow: 'استرجاع الآن', restoring: 'جاري الاسترجاع… البرنامج هيعيد التشغيل', newer: 'النسخة دي معمولة بإصدار أحدث من سنترال برو. حدّث البرنامج الأول.',
      shop: 'المحل', createdAt: 'تاريخ النسخة', version: 'الإصدار', contents: 'المحتوى', counts: '{{products}} صنف · {{customers}} عميل · {{sales}} عملية بيع · {{repairs}} صيانة',
      fromBackup: 'استرجاع من نسخة احتياطية', fromBackupHint: 'جاي من جهاز تاني؟ استرجع محلك من نسخة احتياطية أو ملف نقل.'
    },
    importer: {
      title: 'استيراد من Excel / CSV', products: 'استيراد الأصناف', customers: 'استيراد العملاء', button: 'استيراد',
      steps: { file: 'الملف', columns: 'الأعمدة', check: 'المراجعة', done: 'تم' },
      chooseFile: 'اختر ملف', dropHint: 'ملف Excel ‏(.xlsx) أو CSV. أول صف لازم يكون فيه أسماء الأعمدة.', template: 'تحميل نموذج جاهز',
      rows: '{{count}} صف', column: 'العمود في ملفك', notImported: '— لا يتم استيراده —', required: 'مطلوب', sample: 'أول صفوف من ملفك',
      fields: {
        name: 'الاسم', sellPrice: 'سعر البيع', costPrice: 'التكلفة', stock: 'الكمية', barcode: 'الباركود', sku: 'كود الصنف', category: 'القسم', brand: 'الماركة', minStock: 'حد التنبيه', minPrice: 'أقل سعر',
        phone: 'الموبايل', phone2: 'رقم تاني', address: 'العنوان', notes: 'ملاحظات', balance: 'الرصيد (عليه لنا)'
      },
      ready: '{{count}} صف جاهز للاستيراد', existing: '{{count}} موجود بالفعل', problems: '{{count}} صف فيه مشاكل وهيتم تخطيه',
      existingMode: 'الصفوف الموجودة بالفعل', skip: 'تخطيها', update: 'تحديثها', updateHintProducts: 'بيحدّث الأسعار بس. المخزون عمره ما بيتغير من الاستيراد.', updateHintCustomers: 'بيحدّث بيانات التواصل بس. الأرصدة مش بتتغير.',
      row: 'الصف', field: 'العمود', problem: 'المشكلة', value: 'القيمة',
      codes: { REQUIRED: 'ناقص', INVALID_NUMBER: 'رقم غير صحيح', INVALID_BARCODE: 'باركود غير صحيح', DUPLICATE_IN_FILE: 'متكرر في الملف', EXISTS: 'موجود بالفعل', ERROR: 'تعذر الحفظ' },
      run: 'استيراد {{count}} صف', running: 'جاري الاستيراد… تقدر تكمل بيع عادي', next: 'مراجعة البيانات',
      result: 'تم الاستيراد', created: 'اتضاف', updated: 'اتحدث', skipped: 'اتخطى', failed: 'فشل', failedReport: 'تحميل تقرير المشاكل', problemsTitle: 'مشاكل الاستيراد'
    }
  }
}
