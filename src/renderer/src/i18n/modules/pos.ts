export const pos = {
  en: {
    pos: {
      title: 'Point of sale', searchPlaceholder: 'Scan barcode or search product… (F2)', favorites: 'Favorites', recent: 'Recent', allCategories: 'All',
      emptyCart: 'Cart is empty', emptyCartHint: 'Scan a barcode or tap a product to start', items: '{{count}} items', subtotal: 'Subtotal', discount: 'Discount',
      tax: 'Tax', total: 'Total', pay: 'Pay', hold: 'Hold', held: 'Held carts', clear: 'Clear', customer: 'Customer', walkIn: 'Walk-in customer',
      selectCustomer: 'Select customer (F4)', newCustomer: 'New customer', quickSale: 'Quick sale', invoice: 'Invoice', cartDiscount: 'Discount on the whole cart',
      lineDiscount: 'Item discount', percent: '%', amount: 'Amount', unitPrice: 'Unit price', remove: 'Remove', customItem: 'Custom item', customItemName: 'Item name',
      openPrice: 'Enter price', enterPrice: 'Enter the price for “{{name}}”', notFound: 'No product with code “{{code}}”', addProduct: 'Add product',
      outOfStock: 'Out of stock', inStock: '{{count}} in stock', selectSerial: 'Select IMEI / serial', serial: 'IMEI', noSerials: 'No units in stock',
      payment: 'Payment', tendered: 'Received', change: 'Change', remaining: 'Remaining', exact: 'Exact', addPayment: 'Add payment method',
      onCredit: 'On credit (customer debt)', complete: 'Complete sale', completeHint: 'F10 / Enter', saleDone: 'Sale completed', changeDue: 'Change to give',
      newSale: 'New sale', printReceipt: 'Print receipt', printInvoice: 'Print invoice', receiptNo: 'Receipt #{{number}}', creditNeedsCustomer: 'Select a customer to leave a remaining balance',
      holdLabel: 'Name for this cart', holdDone: 'Cart held', resume: 'Resume', noHeld: 'No held carts', confirmClear: 'Clear the cart?',
      methods: { CASH: 'Cash', CARD: 'Card', WALLET: 'E-wallet', TRANSFER: 'Bank transfer', CREDIT: 'Store credit', POINTS: 'Loyalty points', ORIGINAL: 'Original payment' },
      shift: 'Shift', shiftOpen: 'Shift open', noShift: 'No open shift', openShift: 'Open shift', openShiftTitle: 'Start your shift', openShiftBody: 'Count the cash in the drawer to start selling.',
      openingCash: 'Cash in drawer', closeShift: 'Close shift', closeShiftTitle: 'Close shift {{number}}', countedCash: 'Counted cash', expectedCash: 'Expected cash',
      difference: 'Difference', cashIn: 'Cash in', cashOut: 'Cash out', cashMovement: 'Drawer movement', shiftSummary: 'Shift summary', salesCount: 'Sales',
      salesTotal: 'Sales total', refundsTotal: 'Refunds', byMethod: 'By payment method', supplierPayments: 'Paid to suppliers', shiftClosed: 'Shift closed',
      history: 'Sales history', shifts: 'Shifts', points: 'Points', redeemPoints: 'Use points', pointsAvailable: '{{count}} points available', balance: 'Balance',
      customerOwes: 'Owes {{amount}}', shortcuts: 'Shortcuts', wholesale: 'Wholesale price', priceChanged: 'Price changed', qtyShort: 'Qty', notes: 'Note',
      lastSale: 'Last sale', reprint: 'Reprint', sound: 'Scanned'
    },
    sales: {
      title: 'Sales', number: 'Receipt', invoiceNumber: 'Invoice', cashier: 'Cashier', customer: 'Customer', status: 'Status', profit: 'Profit',
      statuses: { COMPLETED: 'Completed', PARTIALLY_REFUNDED: 'Partly returned', REFUNDED: 'Returned', VOIDED: 'Cancelled' },
      kinds: { QUICK: 'Quick', INVOICE: 'Invoice' }, searchPlaceholder: 'Receipt #, invoice #, customer name or phone', items: 'Items',
      refund: 'Return items', void: 'Cancel sale', voidReason: 'Reason for cancelling', voidConfirm: 'Cancel this whole sale? Stock and payments will be reversed.',
      refundTitle: 'Return items from {{number}}', refundQty: 'Return qty', restock: 'Back to stock', refundMethod: 'Give money back as', refundTotal: 'Refund amount',
      refunded: 'Returned', refundDone: 'Return completed', voided: 'Sale cancelled', paid: 'Paid', credit: 'On credit', approvedBy: 'Approved by',
      refunds: 'Returns', payments: 'Payments', noSales: 'No sales yet', loyaltyEarned: 'Points earned: {{count}}', warranty: 'Warranty {{days}} days'
    }
  },
  ar: {
    pos: {
      title: 'نقطة البيع', searchPlaceholder: 'امسح الباركود أو ابحث عن صنف… (F2)', favorites: 'المفضلة', recent: 'الأخيرة', allCategories: 'الكل',
      emptyCart: 'السلة فارغة', emptyCartHint: 'امسح باركود أو اضغط على صنف للبدء', items: '{{count}} قطعة', subtotal: 'الإجمالي قبل الخصم', discount: 'الخصم',
      tax: 'الضريبة', total: 'الإجمالي', pay: 'دفع', hold: 'تعليق', held: 'الفواتير المعلقة', clear: 'مسح', customer: 'العميل', walkIn: 'عميل نقدي',
      selectCustomer: 'اختيار عميل (F4)', newCustomer: 'عميل جديد', quickSale: 'بيع سريع', invoice: 'فاتورة', cartDiscount: 'خصم على الفاتورة كلها',
      lineDiscount: 'خصم على الصنف', percent: '%', amount: 'مبلغ', unitPrice: 'سعر القطعة', remove: 'حذف', customItem: 'صنف يدوي', customItemName: 'اسم الصنف',
      openPrice: 'أدخل السعر', enterPrice: 'أدخل سعر «{{name}}»', notFound: 'لا يوجد صنف بالكود «{{code}}»', addProduct: 'إضافة صنف',
      outOfStock: 'نفد', inStock: 'متاح {{count}}', selectSerial: 'اختر رقم IMEI / السيريال', serial: 'IMEI', noSerials: 'لا توجد قطع بالمخزن',
      payment: 'الدفع', tendered: 'المبلغ المستلم', change: 'الباقي', remaining: 'المتبقي', exact: 'المبلغ بالضبط', addPayment: 'إضافة طريقة دفع',
      onCredit: 'آجل (على حساب العميل)', complete: 'إتمام البيع', completeHint: 'F10 / Enter', saleDone: 'تم البيع', changeDue: 'الباقي للعميل',
      newSale: 'بيع جديد', printReceipt: 'طباعة الإيصال', printInvoice: 'طباعة الفاتورة', receiptNo: 'إيصال رقم {{number}}', creditNeedsCustomer: 'اختر العميل لتسجيل المتبقي آجل',
      holdLabel: 'اسم لهذه الفاتورة', holdDone: 'تم تعليق الفاتورة', resume: 'استكمال', noHeld: 'لا توجد فواتير معلقة', confirmClear: 'مسح السلة؟',
      methods: { CASH: 'كاش', CARD: 'فيزا', WALLET: 'محفظة', TRANSFER: 'تحويل', CREDIT: 'رصيد للعميل', POINTS: 'نقاط الولاء', ORIGINAL: 'نفس طريقة الدفع' },
      shift: 'الوردية', shiftOpen: 'وردية مفتوحة', noShift: 'لا توجد وردية', openShift: 'فتح وردية', openShiftTitle: 'ابدأ ورديتك', openShiftBody: 'عُد النقدية الموجودة في الدرج لبدء البيع.',
      openingCash: 'النقدية في الدرج', closeShift: 'قفل الوردية', closeShiftTitle: 'قفل الوردية {{number}}', countedCash: 'النقدية الفعلية', expectedCash: 'النقدية المتوقعة',
      difference: 'الفرق', cashIn: 'إيداع', cashOut: 'سحب / مصروف', cashMovement: 'حركة الدرج', shiftSummary: 'ملخص الوردية', salesCount: 'عدد المبيعات',
      salesTotal: 'إجمالي المبيعات', refundsTotal: 'المرتجعات', byMethod: 'حسب طريقة الدفع', supplierPayments: 'مدفوع للموردين', shiftClosed: 'تم قفل الوردية',
      history: 'سجل المبيعات', shifts: 'الورديات', points: 'نقاط', redeemPoints: 'استخدام النقاط', pointsAvailable: '{{count}} نقطة متاحة', balance: 'الرصيد',
      customerOwes: 'عليه {{amount}}', shortcuts: 'الاختصارات', wholesale: 'سعر الجملة', priceChanged: 'سعر معدل', qtyShort: 'ك', notes: 'ملاحظة',
      lastSale: 'آخر عملية', reprint: 'إعادة طباعة', sound: 'تمت القراءة'
    },
    sales: {
      title: 'المبيعات', number: 'رقم الإيصال', invoiceNumber: 'رقم الفاتورة', cashier: 'الكاشير', customer: 'العميل', status: 'الحالة', profit: 'الربح',
      statuses: { COMPLETED: 'مكتملة', PARTIALLY_REFUNDED: 'مرتجع جزئي', REFUNDED: 'مرتجعة', VOIDED: 'ملغاة' },
      kinds: { QUICK: 'سريع', INVOICE: 'فاتورة' }, searchPlaceholder: 'رقم الإيصال أو الفاتورة أو اسم/موبايل العميل', items: 'الأصناف',
      refund: 'مرتجع', void: 'إلغاء العملية', voidReason: 'سبب الإلغاء', voidConfirm: 'إلغاء العملية بالكامل؟ سيتم إرجاع المخزون والمدفوعات.',
      refundTitle: 'مرتجع من {{number}}', refundQty: 'كمية المرتجع', restock: 'يرجع للمخزن', refundMethod: 'رد المبلغ عن طريق', refundTotal: 'مبلغ المرتجع',
      refunded: 'مرتجع', refundDone: 'تم المرتجع', voided: 'تم إلغاء العملية', paid: 'المدفوع', credit: 'آجل', approvedBy: 'بموافقة',
      refunds: 'المرتجعات', payments: 'المدفوعات', noSales: 'لا توجد مبيعات بعد', loyaltyEarned: 'نقاط مكتسبة: {{count}}', warranty: 'ضمان {{days}} يوم'
    }
  }
}
