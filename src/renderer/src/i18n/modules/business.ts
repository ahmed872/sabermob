export const business = {
  en: {
    customers: {
      title: 'Customers', subtitle: 'Profiles, debts and history', newCustomer: 'New customer', editCustomer: 'Edit customer', type: 'Type',
      types: { REGULAR: 'Regular', VIP: 'VIP', WHOLESALE: 'Wholesale' }, balance: 'Balance', owes: 'Owes', credit: 'Credit', totalSpent: 'Total spent',
      lastPurchase: 'Last purchase', points: 'Points', creditLimit: 'Credit limit', creditLimitHint: 'Leave empty for no limit', tags: 'Tags', tagsHint: 'Comma separated',
      openingBalance: 'Opening debt', collect: 'Collect payment', collectTitle: 'Collect from {{name}}', collected: 'Payment collected', ledger: 'Account statement',
      purchases: 'Purchases', repairs: 'Repairs', withDebt: 'With debt', noCustomers: 'No customers yet', adjust: 'Adjust balance', adjustPoints: 'Adjust points',
      ledgerTypes: { SALE_CREDIT: 'Bought on credit', PAYMENT: 'Payment', REFUND: 'Return', REPAIR_CREDIT: 'Repair on credit', ADJUSTMENT: 'Adjustment', OPENING: 'Opening balance' },
      sort: { recent: 'Recent', name: 'Name', balance: 'Highest debt' }, saved: 'Customer saved', duplicatePhone: 'This phone belongs to {{name}}'
    },
    suppliers: {
      title: 'Suppliers', supplier: 'Supplier', subtitle: 'Purchases, payments and balances', newSupplier: 'New supplier', editSupplier: 'Edit supplier', company: 'Company',
      weOwe: 'We owe', theyOwe: 'Owes us', settled: 'Settled', balance: 'Balance', totalPurchases: 'Total purchases', totalPaid: 'Total paid', openingBalance: 'Opening balance',
      openingHint: 'Positive = we owe them, negative = they owe us', pay: 'Pay supplier', receiveMoney: 'Receive money', paymentDone: 'Payment saved',
      purchases: 'Purchases', payments: 'Payments', ledger: 'Statement', newPurchase: 'New purchase', purchase: 'Purchase', invoiceNo: 'Supplier invoice #',
      unitCost: 'Unit cost', receiveNow: 'Goods received now (add to stock)', receiveNowHint: 'Turn off to save as an order and receive later',
      paidNow: 'Paid now', receive: 'Receive goods', received: 'Received', damaged: 'Damaged', ordered: 'Ordered', outstanding: 'Outstanding', cancelPurchase: 'Cancel order',
      returnToSupplier: 'Return to supplier', returnDone: 'Goods returned to supplier', statuses: { DRAFT: 'Draft', ORDERED: 'Ordered', PARTIAL: 'Partly received', RECEIVED: 'Received', CANCELLED: 'Cancelled' },
      ledgerTypes: { OPENING: 'Opening balance', PURCHASE: 'Purchase', PAYMENT: 'Payment', RETURN: 'Returned goods', ADJUSTMENT: 'Adjustment', PAYMENT_VOID: 'Payment cancelled' },
      voidPayment: 'Cancel payment', noSuppliers: 'No suppliers yet', addItems: 'Add products', purchaseSaved: 'Purchase saved', imeis: 'IMEIs ({{count}})', imeisHint: 'optional, one per line',
      direction: { OUT: 'Paid to supplier', IN: 'Received from supplier' }, valueReceived: 'Value received'
    },
    repairs: {
      title: 'Repairs', subtitle: 'Device tickets and workshop', newTicket: 'New repair', ticket: 'Ticket', board: 'Board', list: 'List', boardLimited: 'Showing the newest {{shown}} of {{total}} open devices. Use the list or search for older ones, and move devices nobody collected to “Not collected”.', customer: 'Customer',
      device: 'Device', brand: 'Brand', model: 'Model', imei: 'IMEI', serialNumber: 'Serial number', color: 'Color', condition: 'Device condition',
      conditionHint: 'Scratches, cracks, missing buttons…', passcode: 'Screen lock / passcode', showPasscode: 'Show passcode', complaint: 'Customer complaint',
      diagnosis: 'Technician diagnosis', notes: 'Internal notes', accessories: 'Received with the device', technician: 'Technician', unassigned: 'Unassigned',
      estimatedPrice: 'Estimated price', laborPrice: 'Labor / service', finalPrice: 'Final price', partsTotal: 'Parts', deposit: 'Deposit', paid: 'Paid', balanceDue: 'Remaining',
      expectedAt: 'Expected ready', receivedAt: 'Received', deliveredAt: 'Delivered', warranty: 'Warranty', warrantyDays: 'Warranty (days)', warrantyUntil: 'Under warranty until {{date}}',
      warrantyClaim: 'Warranty claim', warrantyFound: 'This device was repaired before and is still under warranty', useWarranty: 'Open as warranty claim',
      repairType: 'Repair type', parts: 'Parts used', addPart: 'Add part', restockPart: 'Return part to stock', customPart: 'Part not in stock list', photos: 'Photos',
      addPhoto: 'Add photo', takePhoto: 'Take photo', photoKinds: { BEFORE: 'Before', AFTER: 'After', DAMAGE: 'Damage' }, signature: 'Customer signature',
      signHere: 'Sign here', clearSignature: 'Clear', history: 'History', changeStatus: 'Move to', deliver: 'Deliver to customer', deliverTitle: 'Deliver {{number}}',
      cancelRepair: 'Cancel repair', refundDeposit: 'Return the deposit to the customer', overdue: 'Overdue', open: 'In progress', all: 'All',
      created: 'Repair ticket created', saved: 'Repair saved', profit: 'Profit', addPayment: 'Add payment', noRepairs: 'No repairs', searchPlaceholder: 'Ticket #, phone, name, IMEI, model',
      accessoriesList: { CHARGER: 'Charger', SIM: 'SIM card', MEMORY_CARD: 'Memory card', CASE: 'Case', BOX: 'Box', CABLE: 'Cable', EARPHONES: 'Earphones', STYLUS: 'Stylus pen' },
      step: { customer: 'Customer', device: 'Device', problem: 'Problem & price', confirm: 'Confirm' }, statuses: 'Repair statuses', camera: 'Camera', capture: 'Capture',
      deletedTicket: 'Repair deleted'
    }
  },
  ar: {
    customers: {
      title: 'العملاء', subtitle: 'البيانات والمديونيات والسجل', newCustomer: 'عميل جديد', editCustomer: 'تعديل عميل', type: 'النوع',
      types: { REGULAR: 'عادي', VIP: 'مميز VIP', WHOLESALE: 'جملة' }, balance: 'الرصيد', owes: 'عليه', credit: 'له', totalSpent: 'إجمالي المشتريات',
      lastPurchase: 'آخر شراء', points: 'النقاط', creditLimit: 'حد الآجل', creditLimitHint: 'اتركه فارغاً بدون حد', tags: 'تصنيفات', tagsHint: 'افصل بينها بفاصلة',
      openingBalance: 'مديونية سابقة', collect: 'تحصيل', collectTitle: 'تحصيل من {{name}}', collected: 'تم التحصيل', ledger: 'كشف الحساب',
      purchases: 'المشتريات', repairs: 'الصيانة', withDebt: 'عليهم فلوس', noCustomers: 'لا يوجد عملاء بعد', adjust: 'تسوية الرصيد', adjustPoints: 'تعديل النقاط',
      ledgerTypes: { SALE_CREDIT: 'شراء آجل', PAYMENT: 'دفعة', REFUND: 'مرتجع', REPAIR_CREDIT: 'صيانة آجل', ADJUSTMENT: 'تسوية', OPENING: 'رصيد سابق' },
      sort: { recent: 'الأحدث', name: 'الاسم', balance: 'الأعلى مديونية' }, saved: 'تم حفظ العميل', duplicatePhone: 'هذا الرقم مسجل باسم {{name}}'
    },
    suppliers: {
      title: 'الموردين', supplier: 'المورد', subtitle: 'المشتريات والمدفوعات والأرصدة', newSupplier: 'مورد جديد', editSupplier: 'تعديل مورد', company: 'الشركة',
      weOwe: 'علينا له', theyOwe: 'لنا عنده', settled: 'خالص', balance: 'الرصيد', totalPurchases: 'إجمالي المشتريات', totalPaid: 'إجمالي المدفوع', openingBalance: 'رصيد سابق',
      openingHint: 'موجب = علينا له، سالب = لنا عنده', pay: 'دفع للمورد', receiveMoney: 'استلام فلوس', paymentDone: 'تم حفظ الدفعة',
      purchases: 'المشتريات', payments: 'المدفوعات', ledger: 'كشف الحساب', newPurchase: 'فاتورة شراء', purchase: 'فاتورة شراء', invoiceNo: 'رقم فاتورة المورد',
      unitCost: 'تكلفة القطعة', receiveNow: 'تم استلام البضاعة الآن (تضاف للمخزن)', receiveNowHint: 'أوقفه لحفظها كطلبية واستلامها لاحقاً',
      paidNow: 'المدفوع الآن', receive: 'استلام بضاعة', received: 'المستلم', damaged: 'تالف', ordered: 'المطلوب', outstanding: 'المتبقي', cancelPurchase: 'إلغاء الطلبية',
      returnToSupplier: 'مرتجع للمورد', returnDone: 'تم إرجاع البضاعة للمورد', statuses: { DRAFT: 'مسودة', ORDERED: 'مطلوبة', PARTIAL: 'استلام جزئي', RECEIVED: 'مستلمة', CANCELLED: 'ملغاة' },
      ledgerTypes: { OPENING: 'رصيد سابق', PURCHASE: 'مشتريات', PAYMENT: 'دفعة', RETURN: 'مرتجع بضاعة', ADJUSTMENT: 'تسوية', PAYMENT_VOID: 'إلغاء دفعة' },
      voidPayment: 'إلغاء الدفعة', noSuppliers: 'لا يوجد موردين بعد', addItems: 'إضافة أصناف', purchaseSaved: 'تم حفظ فاتورة الشراء', imeis: 'أرقام IMEI ({{count}})', imeisHint: 'اختياري — رقم في كل سطر (لو مش معاك سيبها فاضية)',
      direction: { OUT: 'مدفوع للمورد', IN: 'مستلم من المورد' }, valueReceived: 'قيمة المستلم'
    },
    repairs: {
      title: 'الصيانة', subtitle: 'تذاكر الأجهزة والورشة', newTicket: 'استلام جهاز', ticket: 'تذكرة', board: 'لوحة', list: 'قائمة', boardLimited: 'معروض أحدث {{shown}} من {{total}} جهاز مفتوح. استخدم «قائمة» أو البحث للأقدم، وانقل الأجهزة اللي أصحابها ما رجعوش لـ «لم يُستلم».', customer: 'العميل',
      device: 'الجهاز', brand: 'الماركة', model: 'الموديل', imei: 'IMEI', serialNumber: 'السيريال', color: 'اللون', condition: 'حالة الجهاز',
      conditionHint: 'خدوش، كسر، أزرار ناقصة…', passcode: 'رمز قفل الشاشة', showPasscode: 'إظهار الرمز', complaint: 'شكوى العميل',
      diagnosis: 'تشخيص الفني', notes: 'ملاحظات داخلية', accessories: 'مستلم مع الجهاز', technician: 'الفني', unassigned: 'غير محدد',
      estimatedPrice: 'السعر المبدئي', laborPrice: 'المصنعية', finalPrice: 'السعر النهائي', partsTotal: 'قطع الغيار', deposit: 'عربون', paid: 'المدفوع', balanceDue: 'المتبقي',
      expectedAt: 'موعد التسليم', receivedAt: 'تاريخ الاستلام', deliveredAt: 'تاريخ التسليم', warranty: 'الضمان', warrantyDays: 'الضمان (أيام)', warrantyUntil: 'في الضمان حتى {{date}}',
      warrantyClaim: 'ضمان', warrantyFound: 'هذا الجهاز تم إصلاحه من قبل ولا يزال في الضمان', useWarranty: 'فتح كتذكرة ضمان',
      repairType: 'نوع الصيانة', parts: 'قطع الغيار المستخدمة', addPart: 'إضافة قطعة', restockPart: 'إرجاع القطعة للمخزن', customPart: 'قطعة غير موجودة بالمخزن', photos: 'الصور',
      addPhoto: 'إضافة صورة', takePhoto: 'التقاط صورة', photoKinds: { BEFORE: 'قبل', AFTER: 'بعد', DAMAGE: 'تلف' }, signature: 'توقيع العميل',
      signHere: 'وقّع هنا', clearSignature: 'مسح', history: 'السجل', changeStatus: 'نقل إلى', deliver: 'تسليم للعميل', deliverTitle: 'تسليم {{number}}',
      cancelRepair: 'إلغاء الصيانة', refundDeposit: 'إرجاع العربون للعميل', overdue: 'متأخر', open: 'تحت الإصلاح', all: 'الكل',
      created: 'تم إنشاء تذكرة الصيانة', saved: 'تم الحفظ', profit: 'الربح', addPayment: 'إضافة دفعة', noRepairs: 'لا توجد تذاكر', searchPlaceholder: 'رقم التذكرة، الموبايل، الاسم، IMEI، الموديل',
      accessoriesList: { CHARGER: 'شاحن', SIM: 'شريحة', MEMORY_CARD: 'كارت ميموري', CASE: 'جراب', BOX: 'علبة', CABLE: 'كابل', EARPHONES: 'سماعة', STYLUS: 'قلم' },
      step: { customer: 'العميل', device: 'الجهاز', problem: 'العطل والسعر', confirm: 'تأكيد' }, statuses: 'حالات الصيانة', camera: 'الكاميرا', capture: 'التقاط',
      deletedTicket: 'تم حذف التذكرة'
    }
  }
}
