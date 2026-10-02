export const data = {
  en: {
    backup: {
      last: 'Last backup', never: 'No backup yet', next: 'Next automatic backup', now: 'Back up now', creating: 'Backing up…', created: 'Backup saved and encrypted',
      restoreFile: 'Restore from a file…', openFolder: 'Open backup folder', protectedOs: 'Encrypted · key protected by this Windows account', protectedPlain: 'Encrypted with your backup password',
      notConfigured: 'Set a backup password to start protecting your data', notConfiguredBody: 'Backups are always encrypted. You will need this password to restore your data on another computer.',
      locked: 'Automatic backups are paused on this computer', lockedBody: 'Enter the backup password once to resume them.', unlock: 'Resume backups', unlocked: 'Automatic backups resumed',
      password: 'Backup password', newPassword: 'New backup password', confirm: 'Confirm password', mismatch: 'Passwords do not match', setPassword: 'Save password', passwordSaved: 'Backup password saved',
      changePassword: 'Change backup password', changeHint: 'Older backups keep the password they were made with.', currentPassword: 'Current backup password',
      folders: 'Where backups are saved', folder: 'Backup folder', mirror: 'Extra copy (USB / external drive)', mirrorHint: 'Each backup is also copied here. Recommended: a USB stick or another disk.', none: 'Not set',
      change: 'Change', choose: 'Choose', reset: 'Use default', remove: 'Remove',
      history: 'Backups', verify: 'Check', verified: 'Backup is healthy: {{products}} products, {{sales}} sales', restore: 'Restore', missing: 'File missing', failed: 'Failed',
      kinds: { AUTO: 'Automatic', MANUAL: 'Manual', PRE_RESTORE: 'Before restore', BUNDLE: 'Transfer bundle' },
      move: 'Move to another computer', moveBody: 'Save the whole shop (data, photos and settings) in one encrypted file. On the new computer choose “Restore from backup” on the first screen.',
      exportBundle: 'Save transfer file', bundleSaved: 'Transfer file saved: {{path}}',
      restoreTitle: 'Restore backup', restoreWarn: 'All current data on this computer will be replaced by this backup.', restoreSafety: 'A safety copy of the current data is saved first, so this can be undone.',
      restoreUnderstand: 'I understand that current data will be replaced', restoreNow: 'Restore now', restoring: 'Restoring… the app will restart', newer: 'This backup was made by a newer version of Central Pro. Update the app first.',
      shop: 'Shop', createdAt: 'Made on', version: 'Version', contents: 'Contains', counts: '{{products}} products · {{customers}} customers · {{sales}} sales · {{repairs}} repairs',
      fromBackup: 'Restore from backup', fromBackupHint: 'Moving from another computer? Restore your shop from a backup or transfer file.'
    }
  },
  ar: {
    backup: {
      last: 'آخر نسخة احتياطية', never: 'لا توجد نسخة احتياطية بعد', next: 'النسخة التلقائية القادمة', now: 'نسخة احتياطية الآن', creating: 'جاري النسخ…', created: 'تم حفظ النسخة الاحتياطية مشفرة',
      restoreFile: 'استرجاع من ملف…', openFolder: 'فتح مجلد النسخ', protectedOs: 'مشفرة · المفتاح محمي بحساب ويندوز ده', protectedPlain: 'مشفرة بكلمة مرور النسخ الاحتياطي',
      notConfigured: 'حدد كلمة مرور للنسخ الاحتياطي عشان نبدأ نحمي بياناتك', notConfiguredBody: 'النسخ الاحتياطية دايماً مشفرة. هتحتاج كلمة المرور دي عشان تسترجع بياناتك على جهاز تاني.',
      locked: 'النسخ التلقائي متوقف على الجهاز ده', lockedBody: 'اكتب كلمة مرور النسخ الاحتياطي مرة واحدة عشان يرجع يشتغل.', unlock: 'تشغيل النسخ', unlocked: 'رجع النسخ التلقائي يشتغل',
      password: 'كلمة مرور النسخ الاحتياطي', newPassword: 'كلمة المرور الجديدة', confirm: 'تأكيد كلمة المرور', mismatch: 'كلمتا المرور غير متطابقتين', setPassword: 'حفظ كلمة المرور', passwordSaved: 'تم حفظ كلمة مرور النسخ الاحتياطي',
      changePassword: 'تغيير كلمة مرور النسخ الاحتياطي', changeHint: 'النسخ القديمة تفضل بكلمة المرور اللي اتعملت بيها.', currentPassword: 'كلمة المرور الحالية',
      folders: 'مكان حفظ النسخ', folder: 'مجلد النسخ الاحتياطي', mirror: 'نسخة إضافية (فلاشة / هارد خارجي)', mirrorHint: 'كل نسخة بتتنسخ هنا كمان. يفضل فلاشة أو هارد تاني.', none: 'غير محدد',
      change: 'تغيير', choose: 'اختيار', reset: 'الافتراضي', remove: 'إزالة',
      history: 'النسخ الاحتياطية', verify: 'فحص', verified: 'النسخة سليمة: {{products}} صنف، {{sales}} عملية بيع', restore: 'استرجاع', missing: 'الملف مش موجود', failed: 'فشلت',
      kinds: { AUTO: 'تلقائية', MANUAL: 'يدوية', PRE_RESTORE: 'قبل الاسترجاع', BUNDLE: 'ملف نقل' },
      move: 'النقل لجهاز تاني', moveBody: 'احفظ المحل كله (البيانات والصور والإعدادات) في ملف واحد مشفر. على الجهاز الجديد اختار «استرجاع من نسخة احتياطية» في أول شاشة.',
      exportBundle: 'حفظ ملف النقل', bundleSaved: 'تم حفظ ملف النقل: {{path}}',
      restoreTitle: 'استرجاع نسخة احتياطية', restoreWarn: 'كل البيانات الحالية على الجهاز ده هتتبدل بالنسخة دي.', restoreSafety: 'هيتعمل نسخة أمان من البيانات الحالية الأول، فتقدر ترجع فيها.',
      restoreUnderstand: 'فاهم إن البيانات الحالية هتتبدل', restoreNow: 'استرجاع الآن', restoring: 'جاري الاسترجاع… البرنامج هيعيد التشغيل', newer: 'النسخة دي معمولة بإصدار أحدث من سنترال برو. حدّث البرنامج الأول.',
      shop: 'المحل', createdAt: 'تاريخ النسخة', version: 'الإصدار', contents: 'المحتوى', counts: '{{products}} صنف · {{customers}} عميل · {{sales}} عملية بيع · {{repairs}} صيانة',
      fromBackup: 'استرجاع من نسخة احتياطية', fromBackupHint: 'جاي من جهاز تاني؟ استرجع محلك من نسخة احتياطية أو ملف نقل.'
    }
  }
}
