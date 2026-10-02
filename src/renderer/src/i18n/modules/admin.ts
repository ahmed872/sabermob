export const admin = {
  en: {
    settings: {
      title: 'Settings', saved: 'Settings saved', unsaved: 'You have unsaved changes',
      sections: {
        company: 'Store information', users: 'Users', roles: 'Roles & permissions', pos: 'Point of sale', taxes: 'Taxes', inventory: 'Inventory',
        repairs: 'Repairs', printing: 'Printers', invoices: 'Invoices & receipts', qr: 'QR codes', offers: 'Smart offers', loyalty: 'Loyalty',
        backup: 'Backup & restore', security: 'Security', license: 'License', audit: 'Activity log', devices: 'This computer'
      },
      groups: { business: 'Business', people: 'People & security', operations: 'Operations', system: 'System' },
      fields: {
        storeName: 'Store name', phone: 'Phone', phone2: 'Second phone', address: 'Address', taxNumber: 'Tax registration number', commercialRegister: 'Commercial register',
        currency: 'Currency', currencyDecimals: 'Decimal places',
        defaultSaleMode: 'Default checkout', defaultSaleModeHint: 'Quick sale prints a simple receipt; invoice adds number and customer details',
        saleModes: { QUICK: 'Quick sale', INVOICE: 'Formal invoice' }, requireShift: 'Require an open shift to sell', allowNegativeStock: 'Allow selling when stock is 0',
        defaultPaymentMethod: 'Default payment method', autoPrintReceipt: 'Print receipt automatically after sale', allowCreditSales: 'Allow selling on credit (customer debt)',
        enabledPaymentMethods: 'Payment methods', scanSound: 'Beep on scan',
        taxEnabled: 'Charge VAT / sales tax', defaultTaxBp: 'Default tax rate %', pricesIncludeTax: 'Product prices already include tax', taxLabel: 'Tax name on receipts',
        defaultMinStock: 'Default low-stock alert quantity', deadStockDays: 'Product is “not selling” after (days)', fastMovingDays: 'Fast-moving period (days)', internalBarcodePrefix: 'Internal barcode prefix',
        defaultWarrantyDays: 'Default repair warranty (days)', requireSignature: 'Require customer signature on receive/delivery', defaultExpectedDays: 'Default expected repair time (days)',
        termsText: 'Repair terms printed on the ticket',
        receiptPaper: 'Receipt paper', receiptPrinter: 'Receipt printer', a4Printer: 'A4 printer', labelPrinter: 'Label printer', labelWidthMm: 'Label width (mm)', labelHeightMm: 'Label height (mm)',
        copies: 'Copies', showLogo: 'Print store logo', systemDefault: 'System default printer',
        footerText: 'Footer message', showCashier: 'Show cashier name', showTaxNumber: 'Show tax number',
        qrEnabled: 'Enable QR codes', qrEnabledHint: 'Everything keeps working when QR is off', onInvoices: 'QR on invoices', onReceipts: 'QR on quick receipts', onRepairs: 'QR on repair tickets', onLabels: 'QR on product labels',
        offersEnabled: 'Show smart suggestions at checkout', maxSuggestions: 'Suggestions shown at once', minMarginBp: 'Never go below margin %', clearanceMaxDiscountBp: 'Max clearance discount %', useAffinity: 'Learn “bought together” from sales',
        loyaltyEnabled: 'Enable loyalty points', amountPerPoint: 'Amount spent to earn 1 point', pointValue: 'Value of 1 point', minRedeemPoints: 'Minimum points to redeem', vipThresholdPoints: 'Points to become VIP',
        autoEnabled: 'Automatic backup', intervalHours: 'Every (hours)', keepCount: 'Keep last backups', directory: 'Backup folder', mirrorDirectory: 'Extra copy (USB / external drive)', backupOnExit: 'Back up when closing the app',
        sessionTimeoutMinutes: 'Lock screen after inactivity (minutes, 0 = never)', maxFailedAttempts: 'Wrong attempts before temporary lock', lockoutMinutes: 'Temporary lock duration (minutes)',
        requireApprovalForRefund: 'Refunds need manager approval'
      },
      deviceId: 'Installation ID', dataFolder: 'Data folder', openFolder: 'Open folder', appVersion: 'Version', database: 'Database size', offline: 'Works fully offline',
      offlineBody: 'All your data is stored on this computer. Cloud sync can be added later without changing how you work.'
    },
    users: {
      title: 'Users', newUser: 'New user', editUser: 'Edit user', role: 'Role', lastLogin: 'Last sign-in', never: 'Never', resetPassword: 'New password',
      resetPasswordHint: 'Leave empty to keep the current password', pinSet: 'PIN set', noPin: 'No PIN', deactivate: 'Deactivate', activate: 'Activate', created: 'User created',
      newRole: 'New role', editRole: 'Edit role', roleName: 'Role name', maxDiscount: 'Max discount without approval %', builtIn: 'Built-in', usersCount: '{{count}} users',
      ownerLocked: 'The owner role always has every permission.'
    },
    audit: {
      title: 'Activity log', filterAction: 'Action', actions: {
        'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.switch_user': 'Switched user', 'auth.unlock': 'Unlocked', 'auth.failed': 'Failed sign-in',
        'auth.override_granted': 'Manager approval', 'system.onboarding_completed': 'Store set up', 'license.activated': 'License activated',
        'product.created': 'Product added', 'product.updated': 'Product edited', 'product.deleted': 'Product deleted', 'product.price_changed': 'Price changed',
        'stock.adjusted': 'Stock adjusted', 'user.created': 'User added', 'user.updated': 'User edited', 'user.password_changed': 'Password changed', 'user.pin_changed': 'PIN changed',
        'role.created': 'Role added', 'role.permissions_changed': 'Permissions changed', 'role.deleted': 'Role deleted', 'settings.changed': 'Settings changed',
        'brand.created': 'Brand added', 'brand.updated': 'Brand edited', 'brand.deleted': 'Brand deleted', 'model.created': 'Model added', 'model.updated': 'Model edited', 'model.deleted': 'Model deleted',
        'category.created': 'Category added', 'category.updated': 'Category edited', 'category.deleted': 'Category deleted'
      }
    }
  },
  ar: {
    settings: {
      title: 'الإعدادات', saved: 'تم حفظ الإعدادات', unsaved: 'لديك تغييرات غير محفوظة',
      sections: {
        company: 'بيانات المحل', users: 'المستخدمين', roles: 'الأدوار والصلاحيات', pos: 'نقطة البيع', taxes: 'الضرائب', inventory: 'المخزن',
        repairs: 'الصيانة', printing: 'الطابعات', invoices: 'الفواتير والإيصالات', qr: 'رموز QR', offers: 'العروض الذكية', loyalty: 'نقاط الولاء',
        backup: 'النسخ الاحتياطي', security: 'الأمان', license: 'الترخيص', audit: 'سجل النشاط', devices: 'هذا الجهاز'
      },
      groups: { business: 'النشاط', people: 'الأشخاص والأمان', operations: 'التشغيل', system: 'النظام' },
      fields: {
        storeName: 'اسم المحل', phone: 'التليفون', phone2: 'تليفون آخر', address: 'العنوان', taxNumber: 'رقم التسجيل الضريبي', commercialRegister: 'السجل التجاري',
        currency: 'العملة', currencyDecimals: 'عدد الكسور العشرية',
        defaultSaleMode: 'طريقة البيع الافتراضية', defaultSaleModeHint: 'البيع السريع يطبع إيصال بسيط؛ الفاتورة تضيف رقم وبيانات العميل',
        saleModes: { QUICK: 'بيع سريع', INVOICE: 'فاتورة رسمية' }, requireShift: 'لازم وردية مفتوحة للبيع', allowNegativeStock: 'السماح بالبيع لو الكمية صفر',
        defaultPaymentMethod: 'طريقة الدفع الافتراضية', autoPrintReceipt: 'طباعة الإيصال تلقائياً بعد البيع', allowCreditSales: 'السماح بالبيع بالآجل (مديونية العميل)',
        enabledPaymentMethods: 'طرق الدفع', scanSound: 'صوت عند قراءة الباركود',
        taxEnabled: 'تحصيل ضريبة القيمة المضافة', defaultTaxBp: 'نسبة الضريبة الافتراضية %', pricesIncludeTax: 'أسعار الأصناف تشمل الضريبة', taxLabel: 'اسم الضريبة على الإيصال',
        defaultMinStock: 'كمية التنبيه الافتراضية', deadStockDays: 'الصنف يعتبر راكد بعد (يوم)', fastMovingDays: 'فترة الأكثر مبيعاً (يوم)', internalBarcodePrefix: 'بادئة الباركود الداخلي',
        defaultWarrantyDays: 'ضمان الصيانة الافتراضي (يوم)', requireSignature: 'طلب توقيع العميل عند الاستلام/التسليم', defaultExpectedDays: 'مدة الإصلاح المتوقعة (يوم)',
        termsText: 'شروط الصيانة المطبوعة على الإيصال',
        receiptPaper: 'ورق الإيصال', receiptPrinter: 'طابعة الإيصالات', a4Printer: 'طابعة A4', labelPrinter: 'طابعة الملصقات', labelWidthMm: 'عرض الملصق (مم)', labelHeightMm: 'طول الملصق (مم)',
        copies: 'عدد النسخ', showLogo: 'طباعة شعار المحل', systemDefault: 'الطابعة الافتراضية للنظام',
        footerText: 'رسالة أسفل الإيصال', showCashier: 'إظهار اسم الكاشير', showTaxNumber: 'إظهار الرقم الضريبي',
        qrEnabled: 'تفعيل رموز QR', qrEnabledHint: 'كل شيء يعمل طبيعياً حتى لو QR معطل', onInvoices: 'QR على الفواتير', onReceipts: 'QR على الإيصالات السريعة', onRepairs: 'QR على إيصالات الصيانة', onLabels: 'QR على ملصقات الأصناف',
        offersEnabled: 'إظهار اقتراحات ذكية عند البيع', maxSuggestions: 'عدد الاقتراحات المعروضة', minMarginBp: 'لا تقل نسبة الربح عن %', clearanceMaxDiscountBp: 'أقصى خصم للتصفية %', useAffinity: 'التعلم من الأصناف التي تُباع معاً',
        loyaltyEnabled: 'تفعيل نقاط الولاء', amountPerPoint: 'المبلغ المطلوب لكسب نقطة', pointValue: 'قيمة النقطة', minRedeemPoints: 'أقل نقاط للاستبدال', vipThresholdPoints: 'النقاط المطلوبة لعميل VIP',
        autoEnabled: 'النسخ الاحتياطي التلقائي', intervalHours: 'كل (ساعة)', keepCount: 'الاحتفاظ بآخر', directory: 'مجلد النسخ الاحتياطي', mirrorDirectory: 'نسخة إضافية (فلاشة / هارد خارجي)', backupOnExit: 'نسخة احتياطية عند غلق البرنامج',
        sessionTimeoutMinutes: 'قفل الشاشة بعد عدم النشاط (دقيقة، 0 = أبداً)', maxFailedAttempts: 'محاولات خاطئة قبل القفل المؤقت', lockoutMinutes: 'مدة القفل المؤقت (دقيقة)',
        requireApprovalForRefund: 'المرتجع يحتاج موافقة المدير'
      },
      deviceId: 'رقم التثبيت', dataFolder: 'مجلد البيانات', openFolder: 'فتح المجلد', appVersion: 'الإصدار', database: 'حجم قاعدة البيانات', offline: 'يعمل بالكامل بدون إنترنت',
      offlineBody: 'كل بياناتك محفوظة على هذا الجهاز. يمكن إضافة المزامنة السحابية لاحقاً بدون تغيير طريقة عملك.'
    },
    users: {
      title: 'المستخدمين', newUser: 'مستخدم جديد', editUser: 'تعديل مستخدم', role: 'الدور', lastLogin: 'آخر دخول', never: 'لم يدخل', resetPassword: 'كلمة مرور جديدة',
      resetPasswordHint: 'اتركها فارغة للإبقاء على كلمة المرور الحالية', pinSet: 'له رقم سري', noPin: 'بدون رقم سري', deactivate: 'إيقاف', activate: 'تفعيل', created: 'تم إضافة المستخدم',
      newRole: 'دور جديد', editRole: 'تعديل دور', roleName: 'اسم الدور', maxDiscount: 'أقصى خصم بدون موافقة %', builtIn: 'أساسي', usersCount: '{{count}} مستخدم',
      ownerLocked: 'دور المالك لديه كل الصلاحيات دائماً.'
    },
    audit: {
      title: 'سجل النشاط', filterAction: 'الإجراء', actions: {
        'auth.login': 'تسجيل دخول', 'auth.logout': 'تسجيل خروج', 'auth.switch_user': 'تبديل مستخدم', 'auth.unlock': 'فتح القفل', 'auth.failed': 'محاولة دخول خاطئة',
        'auth.override_granted': 'موافقة مدير', 'system.onboarding_completed': 'تجهيز المحل', 'license.activated': 'تفعيل الترخيص',
        'product.created': 'إضافة صنف', 'product.updated': 'تعديل صنف', 'product.deleted': 'حذف صنف', 'product.price_changed': 'تغيير سعر',
        'stock.adjusted': 'تسوية مخزون', 'user.created': 'إضافة مستخدم', 'user.updated': 'تعديل مستخدم', 'user.password_changed': 'تغيير كلمة المرور', 'user.pin_changed': 'تغيير الرقم السري',
        'role.created': 'إضافة دور', 'role.permissions_changed': 'تغيير صلاحيات', 'role.deleted': 'حذف دور', 'settings.changed': 'تغيير الإعدادات',
        'brand.created': 'إضافة ماركة', 'brand.updated': 'تعديل ماركة', 'brand.deleted': 'حذف ماركة', 'model.created': 'إضافة موديل', 'model.updated': 'تعديل موديل', 'model.deleted': 'حذف موديل',
        'category.created': 'إضافة قسم', 'category.updated': 'تعديل قسم', 'category.deleted': 'حذف قسم'
      }
    }
  }
}
